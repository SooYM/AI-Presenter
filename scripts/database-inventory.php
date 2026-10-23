<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../backend/bootstrap.php';
try {
    $pdo = database();
    $result = $pdo->query('SELECT VERSION() AS version, @@sql_mode AS sqlMode, @@collation_database AS databaseCollation, DATABASE() AS databaseName')->fetch();
    $result['tableEngines'] = $pdo->query('SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME')->fetchAll();
    $result['grants'] = $pdo->query('SHOW GRANTS')->fetchAll(PDO::FETCH_COLUMN);
    $result['tls'] = $pdo->query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")->fetch();
    $result['rowCounts'] = [];
    foreach (['documents', 'messages', 'settings', 'rate_limits', 'presentations', 'presentation_slides', 'presentation_narrations', 'presentation_progress'] as $table) {
        $result['rowCounts'][$table] = (int)$pdo->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn();
    }
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'Database inventory failed: ' . get_class($error) . PHP_EOL);
    exit(1);
}
