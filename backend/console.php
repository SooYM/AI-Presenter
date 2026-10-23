<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
$command = $argv[1] ?? 'help';
try {
    if ($command === 'migrate') {
        $pdo = database();
        $version = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
        if (stripos($version, 'MariaDB') !== false || version_compare($version, '8.0', '<')) throw new RuntimeException('MySQL 8.0+ is required. MariaDB is not verified.');
        $sql = file_get_contents(PROJECT_ROOT . '/database/schema.sql');
        if ($sql === false) throw new RuntimeException('Schema file is unavailable.');
        $pdo->exec($sql);
        $hasConversation = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='conversation_id'")->fetchColumn();
        if (!$hasConversation) {
            $pdo->exec('ALTER TABLE messages ADD COLUMN conversation_id CHAR(64) NULL AFTER id');
        }
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='kind'")->fetchColumn() === 0) $pdo->exec("ALTER TABLE messages ADD COLUMN kind VARCHAR(24) NOT NULL DEFAULT 'chat' AFTER role");
        // Each phase is restartable; legacy records are never assigned to a new visitor.
        $pdo->exec("UPDATE messages SET conversation_id=SHA2(CONCAT('legacy:',id,UUID()),256) WHERE conversation_id IS NULL");
        if ($pdo->query("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='conversation_id'")->fetchColumn() === 'YES') $pdo->exec('ALTER TABLE messages MODIFY conversation_id CHAR(64) NOT NULL');
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND INDEX_NAME='messages_conversation'")->fetchColumn() === 0) $pdo->exec('ALTER TABLE messages ADD INDEX messages_conversation (conversation_id,id)');
        storagePath();
        echo "Schema applied. Existing records preserved.\n";
    } elseif ($command === 'check') {
        if (version_compare(PHP_VERSION, '8.2', '<')) throw new RuntimeException('PHP 8.2+ is required.');
        foreach (['curl', 'pdo_mysql', 'mbstring', 'fileinfo', 'zip'] as $extension) {
            if (!extension_loaded($extension)) throw new RuntimeException('Required PHP extension is missing: ' . $extension);
        }
        if (!configured()) throw new RuntimeException('Database/APP_URL/APP_SECRET configuration is incomplete.');
        if (config('APP_ENV', 'production') !== 'local' && !str_starts_with(config('APP_URL'), 'https://')) throw new RuntimeException('Production APP_URL must use HTTPS.');
        $pdo = database();
        $server = $pdo->query('SELECT VERSION() AS version, @@sql_mode AS sql_mode, @@collation_database AS collation')->fetch();
        if (stripos($server['version'], 'MariaDB') !== false || version_compare($server['version'], '8.0', '<')) throw new RuntimeException('MySQL 8.0+ is required. MariaDB is not verified.');
        $tables = $pdo->query("SELECT TABLE_NAME AS name,ENGINE AS engine,TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('documents','messages','settings','rate_limits','presentations','presentation_slides','presentation_narrations','presentation_progress')")->fetchAll();
        if (count($tables) !== 8) throw new RuntimeException('Database schema is incomplete. Run migrations with a deployment account.');
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='kind'")->fetchColumn() !== 1) throw new RuntimeException('Presentation message-kind migration is required.');
        if ((int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND COLUMN_NAME='conversation_id' AND IS_NULLABLE='NO'")->fetchColumn() !== 1 || (int)$pdo->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='messages' AND INDEX_NAME='messages_conversation'")->fetchColumn() !== 2) throw new RuntimeException('Visitor conversation migration is required.');
        foreach ($tables as $table) {
            if ($table['engine'] !== 'InnoDB' || !str_starts_with($table['collation'], 'utf8mb4_')) throw new RuntimeException('All application tables must use InnoDB and utf8mb4.');
        }
        if (!is_writable(storagePath())) throw new RuntimeException('Storage directory is not writable.');
        $ssl = $pdo->query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")->fetch();
        if (!in_array(config('DB_HOST', '127.0.0.1'), ['localhost', '127.0.0.1', '::1'], true) && empty($ssl['Value'])) throw new RuntimeException('Remote database connection must negotiate TLS.');
        $grants = $pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($grants as $grant) {
            if (stripos($grant, 'WITH GRANT OPTION') !== false) throw new RuntimeException('Runtime account must not have GRANT OPTION.');
            if (!preg_match('/^GRANT (.*?) ON (.*?) TO /i', $grant, $match)) throw new RuntimeException('Role-based or unrecognized grants need manual least-privilege review.');
            if ($match[1] === 'USAGE' && $match[2] === '*.*') continue;
            $databaseScope = '`' . str_replace('`', '``', config('DB_NAME')) . '`.';
            if (!str_starts_with($match[2], $databaseScope)) throw new RuntimeException('Runtime account may access databases outside this application.');
            foreach (explode(', ', $match[1]) as $privilege) {
                if (!in_array($privilege, ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], true)) throw new RuntimeException('Runtime database account has excessive privileges. Restrict it to SELECT, INSERT, UPDATE and DELETE.');
            }
        }
        $counts = ['documents' => (int)$pdo->query('SELECT COUNT(*) FROM documents')->fetchColumn(), 'messages' => (int)$pdo->query('SELECT COUNT(*) FROM messages')->fetchColumn(), 'presentations' => (int)$pdo->query('SELECT COUNT(*) FROM presentations')->fetchColumn(), 'slides' => (int)$pdo->query('SELECT COUNT(*) FROM presentation_slides')->fetchColumn()];
        echo json_encode(['configured' => configured(), 'aiConfigured' => config('OPENAI_API_KEY') !== '', 'server' => $server, 'tables' => $tables, 'tlsCipher' => $ssl['Value'] ?? '', 'grants' => $grants, 'counts' => $counts, 'storageWritable' => true], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . PHP_EOL;
    } else {
        echo "Usage: php backend/console.php migrate|check\n";
        exit($command === 'help' ? 0 : 1);
    }
} catch (Throwable $error) {
    // Avoid leaking PDO connection details or secrets in operational output.
    fwrite(STDERR, $error instanceof PDOException ? "Database operation failed. Check .env, connectivity and permissions.\n" : $error->getMessage() . "\n");
    exit(1);
}
