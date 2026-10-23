<?php
declare(strict_types=1);

require __DIR__ . '/../../backend/bootstrap.php';
require __DIR__ . '/../../backend/OpenAI.php';
require __DIR__ . '/../../backend/Documents.php';
require __DIR__ . '/../../backend/Chat.php';
require __DIR__ . '/../../backend/Audio.php';
require __DIR__ . '/../../backend/SlideConverter.php';
require __DIR__ . '/../../backend/Presentations.php';
if (is_file(__DIR__ . '/../../backend/AnimationConverter.php')) require __DIR__ . '/../../backend/AnimationConverter.php';

$requestId = bin2hex(random_bytes(12));
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header('X-Request-ID: ' . $requestId);
ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');

function respond(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function sessionPayload(): array {
    return ['authenticated' => true, 'csrfToken' => $_SESSION['csrf'], 'configured' => configured(), 'aiConfigured' => config('OPENAI_API_KEY') !== ''];
}

function positiveId(mixed $value): int {
    if (is_string($value) && ctype_digit($value) && strlen($value) < 19) $value = (int)$value;
    if (!is_int($value) || $value < 1) throw new ApiError(400, 'invalid_id', 'Choose a valid presentation and slide.');
    return $value;
}

function streamSlideVideo(string $path): never {
    $stream=@fopen($path,'rb');
    if($stream===false)throw new ApiError(404,'animation_not_found','This slide animation is unavailable.');
    $size=(int)(fstat($stream)['size']??0);$start=0;$end=$size-1;$partial=false;
    $range=$_SERVER['HTTP_RANGE']??null;
    if($range!==null){
        $valid=is_string($range)&&preg_match('/^bytes=(\d*)-(\d*)$/',$range,$match)&&($match[1]!==''||$match[2]!=='');
        if($valid){if($match[1]===''){$length=(int)$match[2];$start=max(0,$size-$length);$valid=$length>0;}else{$start=(int)$match[1];if($match[2]!=='')$end=min($end,(int)$match[2]);}$valid=$valid&&$start<$size&&$end>=$start;}
        if(!$valid){fclose($stream);header('Content-Range: bytes */'.$size);throw new ApiError(416,'invalid_range','The requested video range is unavailable.');}
        $partial=true;
    }
    if($size<1){fclose($stream);throw new ApiError(404,'animation_not_found','This slide animation is empty.');}
    header('Content-Type: video/mp4');header('Accept-Ranges: bytes');header('Content-Length: '.($end-$start+1));
    if($partial){http_response_code(206);header('Content-Range: bytes '.$start.'-'.$end.'/'.$size);}
    session_write_close();
    if(($_SERVER['REQUEST_METHOD']??'GET')!=='HEAD'){fseek($stream,$start);$remaining=$end-$start+1;while($remaining>0&&!feof($stream)){$chunk=fread($stream,min(65536,$remaining));if($chunk===false||$chunk==='')break;echo $chunk;$remaining-=strlen($chunk);}}
    fclose($stream);exit;
}

try {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    if (config('APP_ENV', 'production') !== 'local' && !$isHttps) throw new ApiError(400, 'https_required', 'HTTPS is required.');
    session_name('folio_session');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $isHttps, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (isset($_SESSION['conversationId']) && time() - (int)($_SESSION['lastSeen'] ?? 0) > 900) {
        if (configured()) clearConversation();
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
    $_SESSION['conversationId'] ??= bin2hex(random_bytes(32));
    $_SESSION['lastSeen'] = time();
    $action = $_GET['action'] ?? 'session';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $readActions = ['session', 'health', 'documents', 'messages', 'presentations', 'presentation', 'slide-image', 'presentation-progress', 'script', 'question-policy', 'slide-animation', 'slide-video'];
    $writeActions = ['new-session', 'upload', 'delete-document', 'chat', 'clear-chat', 'transcribe', 'speech', 'upload-presentation', 'prepare-presentation', 'slide-narration', 'delete-presentation', 'script-status', 'prepare-script', 'save-script', 'save-question-policy', 'prepare-animation'];
    if (!is_string($action) || !in_array($action, array_merge($readActions, $writeActions), true)) throw new ApiError(404, 'not_found', 'Unknown endpoint.');
    $expectedMethods = $action === 'presentation-progress' ? ['GET', 'POST'] : (in_array($action,['slide-animation','slide-video'],true) ? ['GET', 'HEAD'] : [in_array($action, $readActions, true) ? 'GET' : 'POST']);
    if (!in_array($method, $expectedMethods, true)) {
        header('Allow: ' . implode(', ', $expectedMethods));
        throw new ApiError(405, 'method_not_allowed', 'Request method is not allowed.');
    }
    if ($method === 'POST') {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($token) || !hash_equals($_SESSION['csrf'], $token)) throw new ApiError(403, 'csrf_invalid', 'Session expired. Refresh this page and try again.');
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '' && rtrim($origin, '/') !== rtrim(config('APP_URL'), '/')) throw new ApiError(403, 'origin_invalid', 'This request did not originate from the app.');
    }
    if ($action === 'session') respond(sessionPayload());
    if ($action === 'health') {
        if (!configured()) throw new ApiError(503, 'setup_required', 'Server setup is incomplete.');
        database()->query('SELECT 1 FROM settings LIMIT 1');
        storagePath();
        respond(['ok' => true, 'aiConfigured' => config('OPENAI_API_KEY') !== '']);
    }
    if (!configured()) throw new ApiError(503, 'setup_required', 'Server setup is incomplete.');
    if ($action === 'new-session') {
        clearConversation();
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION = ['conversationId' => bin2hex(random_bytes(32)), 'lastSeen' => time(), 'csrf' => bin2hex(random_bytes(32))];
        respond(sessionPayload());
    }
    // Keep the session lock through mutations to preserve ordering within a browser session.
    $openai = new OpenAI();
    $documents = new Documents($openai);
    $presentations = new Presentations($openai);
    if ($action === 'presentations') respond(['presentations' => $presentations->list()]);
    if ($action === 'upload-presentation') respond(['presentation' => $presentations->upload($_FILES['file'] ?? [])], 201);
    if ($action === 'prepare-presentation') respond($presentations->prepare(positiveId(jsonBody()['id'] ?? null)));
    if ($action === 'presentation') respond($presentations->get(positiveId($_GET['id'] ?? null)));
    if ($action === 'question-policy') respond(['policy'=>$presentations->questionPolicy(positiveId($_GET['id']??null))]);
    if ($action === 'save-question-policy') {
        $body=jsonBody();if(!is_array($body['pages']??null)||!is_string($body['revision']??null))throw new ApiError(400,'invalid_question_policy','Send slide numbers and the current settings revision.');
        respond(['policy'=>$presentations->saveQuestionPolicy(positiveId($body['id']??null),$body['pages'],$body['revision'])]);
    }
    if ($action === 'prepare-animation') {
        $body=jsonBody();respond($presentations->prepareAnimation(positiveId($body['id']??null),positiveId($body['page']??null)));
    }
    if ($action === 'slide-video') streamSlideVideo($presentations->video(positiveId($_GET['id']??null),positiveId($_GET['page']??null)));
    if ($action === 'slide-animation') streamSlideVideo($presentations->animation(positiveId($_GET['id']??null),positiveId($_GET['page']??null)));
    if ($action === 'script') {
        if (!is_string($_GET['language'] ?? null)) throw new ApiError(400, 'invalid_language', 'Choose English or Chinese.');
        respond($presentations->viewScript(positiveId($_GET['id'] ?? null), $_GET['language']));
    }
    if ($action === 'save-script') {
        $body = jsonBody(65536);
        if (!is_string($body['language'] ?? null) || !is_string($body['content'] ?? null) || !is_string($body['revision'] ?? null)) throw new ApiError(400, 'invalid_script', 'Send script text, language and saved revision.');
        respond($presentations->saveScript(positiveId($body['id'] ?? null), positiveId($body['page'] ?? null), $body['language'], $body['content'], $body['revision']));
    }
    if ($action === 'slide-image') {
        $path = $presentations->image(positiveId($_GET['id'] ?? null), positiveId($_GET['page'] ?? null));
        header('Content-Type: image/png');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
    if ($action === 'presentation-progress') respond(['progress' => $presentations->progress($method === 'POST' ? jsonBody() : null)]);
    if ($action === 'delete-presentation') {
        $presentations->delete(positiveId(jsonBody()['id'] ?? null));
        respond(['ok' => true]);
    }
    if (in_array($action, ['slide-narration', 'script-status', 'prepare-script'], true)) {
        $body = jsonBody();
        if (!is_string($body['language'] ?? null) || !is_array($body['documentIds'] ?? [])) throw new ApiError(400, 'invalid_narration', 'Choose a slide, language and supporting documents.');
        $id = positiveId($body['id'] ?? null);
        if ($action === 'script-status') respond($presentations->scriptStatus($id, $body['language'], $body['documentIds'] ?? []));
        if ($action === 'prepare-script') respond($presentations->prepareScript($id, $body['language'], $body['documentIds'] ?? []));
        respond($presentations->narration($id, positiveId($body['page'] ?? null), $body['language'], $body['documentIds'] ?? []));
    }
    if ($action === 'documents') respond(['documents' => $documents->list()]);
    if ($action === 'upload') {
        if (config('OPENAI_API_KEY') === '') throw new ApiError(503, 'setup_required', 'Add an OpenAI API key to server configuration before uploading documents.');
        respond(['document' => $documents->upload($_FILES['file'] ?? [])], 201);
    }
    if ($action === 'delete-document') {
        rateLimit('delete-document', 30, 3600);
        $body = jsonBody();
        if (!is_int($body['id'] ?? null) || $body['id'] < 1) throw new ApiError(400, 'invalid_id', 'Choose a valid document.');
        $documents->delete($body['id']);
        respond(['ok' => true]);
    }
    if ($action === 'messages') {
        $stmt = database()->prepare('SELECT * FROM (SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 200) AS recent ORDER BY id ASC');
        $stmt->execute([conversationId()]);
        $rows = $stmt->fetchAll();
        respond(['messages' => array_map('messageJson', $rows)]);
    }
    if ($action === 'clear-chat') {
        clearConversation();
        respond(['ok' => true]);
    }
    if ($action === 'chat') {
        $body = jsonBody();
        if (!is_string($body['message'] ?? null) || !is_array($body['documentIds'] ?? [])) throw new ApiError(400, 'invalid_question', 'Send a question and valid document selection.');
        $presentationId = isset($body['presentationId']) ? positiveId($body['presentationId']) : null;
        $page = isset($body['page']) ? positiveId($body['page']) : null;
        $language = $body['language'] ?? 'auto';
        if (($presentationId === null) !== ($page === null) || !in_array($language, ['auto', 'en', 'zh'], true)) throw new ApiError(400, 'invalid_question', 'Choose a valid slide and language.');
        respond(['message' => (new Chat($openai))->answer($body['message'], $body['documentIds'] ?? [], $presentationId, $page, $language)]);
    }
    if ($action === 'transcribe') respond(['text' => (new Audio($openai))->transcribe($_FILES['audio'] ?? [])]);
    if ($action === 'speech') {
        $body = jsonBody();
        if (!is_int($body['messageId'] ?? null) || $body['messageId'] < 1 || !is_string($body['voice'] ?? 'coral')) throw new ApiError(400, 'invalid_speech', 'Choose an answer and supported voice.');
        if (isset($body['segmentIndex']) && (!is_int($body['segmentIndex']) || $body['segmentIndex'] < 0)) throw new ApiError(400, 'invalid_speech', 'Choose a valid speech segment.');
        $audio = (new Audio($openai))->speak($body['messageId'], $body['voice'] ?? 'coral', $body['segmentIndex'] ?? null);
        header('Content-Type: audio/mpeg');
        header('Content-Length: ' . strlen($audio));
        echo $audio;
        exit;
    }
} catch (ApiError $error) {
    respond(['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()], 'requestId' => $requestId], $error->status);
} catch (Throwable $error) {
    error_log(json_encode(['event' => 'request_failed', 'type' => get_class($error), 'requestId' => $requestId]));
    respond(['error' => ['code' => 'server_error', 'message' => 'Server could not complete this request. Check setup or try again.'], 'requestId' => $requestId], 500);
}
