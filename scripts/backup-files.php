<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../backend/bootstrap.php';
try {
    $destination = $argv[1] ?? '';
    if (!is_dir($destination)) throw new RuntimeException('Backup destination must exist.');
    $uploadDirectory = $destination . DIRECTORY_SEPARATOR . 'uploads';
    if (file_exists($uploadDirectory) || !mkdir($uploadDirectory, 0700)) throw new RuntimeException('Backup uploads directory already exists or cannot be created.');
    $count = 0;
    foreach (database()->query('SELECT storage_name FROM documents')->fetchAll(PDO::FETCH_COLUMN) as $name) {
        if (basename($name) !== $name || str_contains($name, '\\')) throw new RuntimeException('Invalid stored document filename.');
        $source = storagePath() . DIRECTORY_SEPARATOR . $name;
        if (!is_file($source) || !copy($source, $uploadDirectory . DIRECTORY_SEPARATOR . $name)) throw new RuntimeException('A referenced document could not be copied; backup incomplete.');
        $count++;
    }
    $presentationDirectory = $destination . DIRECTORY_SEPARATOR . 'presentations';
    if (!mkdir($presentationDirectory, 0700)) throw new RuntimeException('Could not create presentation backup directory.');
    $decks = 0;
    foreach (database()->query('SELECT storage_key FROM presentations')->fetchAll(PDO::FETCH_COLUMN) as $key) {
        if (!preg_match('/^[a-f0-9]{40}$/', $key)) throw new RuntimeException('Invalid presentation storage key.');
        $sourceDirectory = storagePath() . '/presentations/' . $key;
        if (!is_dir($sourceDirectory) || is_link($sourceDirectory)) throw new RuntimeException('Presentation storage is missing; backup incomplete.');
        $targetDirectory = $presentationDirectory . '/' . $key;
        if (!mkdir($targetDirectory, 0700)) throw new RuntimeException('Could not create presentation backup.');
        foreach (scandir($sourceDirectory) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            $source = $sourceDirectory . '/' . $name;
            if (!is_file($source) || is_link($source) || !copy($source, $targetDirectory . '/' . $name)) throw new RuntimeException('Presentation file could not be copied; backup incomplete.');
        }
        $decks++;
    }
    echo 'Backed up ' . $count . ' document files and ' . $decks . ' presentations.' . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'Document backup failed: ' . get_class($error) . PHP_EOL);
    exit(1);
}
