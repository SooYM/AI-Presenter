<?php
declare(strict_types=1);

const PROJECT_ROOT = __DIR__ . '/..';

// Deliberately small dotenv reader: one KEY=value per line, optional matching quotes.
// Environment variables take precedence. Values are never expanded or evaluated.
$envFile = PROJECT_ROOT . '/.env';
if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        if (!preg_match('/^([A-Z][A-Z0-9_]*)=(.*)$/', trim($line), $match)) continue;
        $value = trim($match[2]);
        if (strlen($value) >= 2 && (($value[0] === '"' && str_ends_with($value, '"')) || ($value[0] === "'" && str_ends_with($value, "'")))) {
            $value = substr($value, 1, -1);
        }
        if (getenv($match[1]) === false) putenv($match[1] . '=' . $value);
    }
}

function config(string $name, string $default = ''): string {
    $value = getenv($name);
    return $value === false || $value === '' ? $default : $value;
}

final class ApiError extends RuntimeException {
    public function __construct(public readonly int $status, public readonly string $errorCode, string $message) {
        parent::__construct($message);
    }
}

function configured(): bool {
    foreach (['DB_NAME', 'DB_USER', 'APP_URL'] as $key) {
        if (config($key) === '') return false;
    }
    return strlen(config('APP_SECRET')) >= 32;
}

function database(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    if (config('DB_NAME') === '' || config('DB_USER') === '') {
        throw new ApiError(503, 'setup_required', 'The server needs database configuration.');
    }
    $host = config('DB_HOST', '127.0.0.1');
    $options = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false];
    if (config('DB_SSL_CA') !== '') {
        $options[PDO::MYSQL_ATTR_SSL_CA] = config('DB_SSL_CA');
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
    } elseif (!in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
        throw new ApiError(503, 'database_tls_required', 'Remote database connections require a trusted CA certificate.');
    }
    $pdo = new PDO('mysql:host=' . $host . ';port=' . config('DB_PORT', '3306') . ';dbname=' . config('DB_NAME') . ';charset=utf8mb4', config('DB_USER'), config('DB_PASSWORD'), $options);
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
    return $pdo;
}

function storagePath(): string {
    $path = config('STORAGE_PATH', PROJECT_ROOT . '/storage');
    if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
        throw new ApiError(503, 'storage_unavailable', 'Document storage is unavailable.');
    }
    $real = realpath($path);
    $public = realpath(PROJECT_ROOT . '/public');
    if ($real === false || ($public !== false && str_starts_with(strtolower(str_replace('\\', '/', $real)) . '/', strtolower(str_replace('\\', '/', $public)) . '/'))) {
        throw new ApiError(503, 'storage_unsafe', 'Document storage must be outside the public directory.');
    }
    return $real;
}

function rateLimit(string $scope, int $limit, int $seconds): void {
    $now = time();
    $window = intdiv($now, $seconds);
    $pdo = database();
    foreach (['ip:' . ($_SERVER['REMOTE_ADDR'] ?? 'cli') => $limit, 'workspace' => $limit * 3] as $identity => $maxHits) {
        $bucket = hash_hmac('sha256', "$scope:$identity:$window", config('APP_SECRET'));
        $stmt = $pdo->prepare('INSERT INTO rate_limits (bucket,hits,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1');
        $stmt->execute([$bucket, ($window + 1) * $seconds]);
        $stmt = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket=?');
        $stmt->execute([$bucket]);
        if ((int)$stmt->fetchColumn() > $maxHits) {
            header('Retry-After: ' . (($window + 1) * $seconds - $now));
            throw new ApiError(429, 'rate_limited', 'Too many requests. Please try again later.');
        }
    }
    $stmt = $pdo->prepare('DELETE FROM rate_limits WHERE expires_at < ? LIMIT 100');
    $stmt->execute([$now]);
}

function conversationId(): string {
    if (!isset($_SESSION['conversationId']) || !is_string($_SESSION['conversationId']) || !preg_match('/^[a-f0-9]{64}$/', $_SESSION['conversationId'])) {
        throw new ApiError(403, 'session_required', 'Refresh the page to start a visitor session.');
    }
    return $_SESSION['conversationId'];
}

function clearConversation(): void {
    $stmt = database()->prepare('DELETE FROM messages WHERE conversation_id=?');
    $stmt->execute([conversationId()]);
    $stmt = database()->prepare('DELETE FROM presentation_progress WHERE conversation_id=?');
    $stmt->execute([conversationId()]);
}

function jsonBody(int $maxBytes=32768): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes) throw new ApiError(413, 'request_too_large', 'Request is too large.');
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes+1);
    if ($raw === false || strlen($raw) > $maxBytes) throw new ApiError(413, 'request_too_large', 'Request is too large.');
    try { $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); }
    catch (JsonException) { throw new ApiError(400, 'invalid_json', 'Send a valid JSON request.'); }
    if (!is_array($body) || array_is_list($body)) throw new ApiError(400, 'invalid_json', 'Send a JSON object.');
    return $body;
}

function documentJson(array $row): array {
    return ['id' => (int)$row['id'], 'name' => $row['name'], 'size' => (int)$row['size'], 'status' => $row['status'], 'error' => $row['error'], 'createdAt' => str_replace(' ', 'T', $row['created_at']) . 'Z'];
}

function messageJson(array $row): array {
    return ['id' => (int)$row['id'], 'role' => $row['role'], 'kind' => $row['kind'] ?? 'chat', 'content' => $row['content'], 'citations' => json_decode($row['citations'], true, 32, JSON_THROW_ON_ERROR), 'speechSegments' => speechSegments($row['content']), 'createdAt' => str_replace(' ', 'T', $row['created_at']) . 'Z'];
}

function speechSegments(string $content): array {
    $paragraphs=preg_split('/\R\h*\R/u',trim($content))?:[];
    $segments=[];
    foreach($paragraphs as $paragraph){
        $paragraph=trim($paragraph);if($paragraph==='')continue;
        if(mb_strlen($paragraph)<=600){$segments[]=$paragraph;continue;}
        preg_match_all('/.+?(?:[.!?。！？](?=\s|$)|$)/us',$paragraph,$matches);
        foreach($matches[0]??[$paragraph] as $sentence){$sentence=trim($sentence);while(mb_strlen($sentence)>600){$segments[]=mb_substr($sentence,0,600);$sentence=mb_substr($sentence,600);}if($sentence!=='')$segments[]=$sentence;}
    }
    return $segments;
}
