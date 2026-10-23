<?php
declare(strict_types=1);

final class Documents {
    public function __construct(private readonly OpenAI $openai) {}

    public function list(): array {
        $pdo = database();
        $pending = $pdo->query("SELECT * FROM documents WHERE status='processing' AND file_id IS NOT NULL AND vector_store_id IS NOT NULL AND (checked_at IS NULL OR checked_at < DATE_SUB(NOW(), INTERVAL 5 SECOND)) ORDER BY checked_at ASC LIMIT 4")->fetchAll();
        foreach ($pending as $row) {
            $stmt = $pdo->prepare('UPDATE documents SET checked_at=NOW() WHERE id=?');
            $stmt->execute([$row['id']]);
            $result = $this->openai->request('GET', 'vector_stores/' . rawurlencode($row['vector_store_id']) . '/files/' . rawurlencode($row['file_id']));
            $status = match ($result['status'] ?? '') { 'completed' => 'ready', 'failed', 'cancelled' => 'failed', default => 'processing' };
            $error = $status === 'failed' ? 'This file could not be indexed. Try a readable PDF, DOCX, TXT or Markdown file.' : null;
            $stmt = $pdo->prepare("UPDATE documents SET status=?,error=? WHERE id=? AND status='processing'");
            $stmt->execute([$status, $error, $row['id']]);
        }
        return array_map('documentJson', $pdo->query('SELECT * FROM documents ORDER BY id DESC')->fetchAll());
    }

    public function upload(array $file): array {
        rateLimit('upload', 20, 3600);
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !isset($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            throw new ApiError(400, 'upload_failed', 'Upload failed. Select one file no larger than 30 MB.');
        }
        $size = filesize($file['tmp_name']);
        if ($size === false || $size < 1 || $size > 30 * 1024 * 1024) throw new ApiError(413, 'file_size', 'Files must be between 1 byte and 30 MB.');
        $name = basename(str_replace('\\', '/', (string)$file['name']));
        $name = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '', 0, 200);
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($extension, ['txt', 'md', 'pdf', 'docx'], true)) throw new ApiError(415, 'file_type', 'Use PDF, DOCX, TXT or Markdown files.');
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $allowed = match ($extension) {
            'pdf' => ['application/pdf'],
            'docx' => ['application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            default => ['text/plain', 'text/markdown', 'text/x-markdown'],
        };
        if (!in_array($mime, $allowed, true)) throw new ApiError(415, 'file_type', 'File contents do not match the selected document type.');
        if (in_array($extension, ['txt', 'md'], true) && !mb_check_encoding(file_get_contents($file['tmp_name']), 'UTF-8')) {
            throw new ApiError(415, 'file_encoding', 'Text documents must use UTF-8 encoding.');
        }
        if ($extension === 'docx') {
            $zip = new ZipArchive();
            if ($zip->open($file['tmp_name']) !== true) throw new ApiError(415, 'file_type', 'This is not a readable DOCX file.');
            $total = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) $total += (int)($zip->statIndex($i)['size'] ?? 0);
            $valid = $zip->locateName('word/document.xml') !== false && $total <= 50 * 1024 * 1024 && $zip->numFiles <= 2000;
            $zip->close();
            if (!$valid) throw new ApiError(415, 'file_type', 'DOCX is invalid or exceeds expanded size limits.');
        }
        $pdo = database();
        $lock = 'folio-upload-' . substr(hash('sha256', config('DB_NAME')), 0, 24);
        $stmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $stmt->execute([$lock]);
        if ((int)$stmt->fetchColumn() !== 1) throw new ApiError(409, 'workspace_busy', 'An upload is in progress. Please try again.');
        try {
            if ((int)$pdo->query('SELECT COUNT(*) FROM documents')->fetchColumn() >= 30) throw new ApiError(409, 'document_limit', 'Workspace holds up to 30 documents. Remove one before uploading.');
            $storageName = bin2hex(random_bytes(20)) . '.' . $extension;
            $path = storagePath() . DIRECTORY_SEPARATOR . $storageName;
            if (!move_uploaded_file($file['tmp_name'], $path)) throw new ApiError(503, 'storage_unavailable', 'Document could not be saved.');
            chmod($path, 0600);
            try {
                $stmt = $pdo->prepare('INSERT INTO documents (name,size,storage_name) VALUES (?,?,?)');
                $stmt->execute([$name, $size, $storageName]);
            } catch (Throwable $error) { unlink($path); throw $error; }
            $id = (int)$pdo->lastInsertId();
            try {
                $store = $this->openai->vectorStore();
                $stmt = $pdo->prepare('UPDATE documents SET vector_store_id=? WHERE id=?');
                $stmt->execute([$store, $id]);
                $remote = $this->openai->request('POST', 'files', ['purpose' => 'assistants', 'file' => new CURLFile($path, (string)$mime, $name)], true);
                if (!isset($remote['id']) || !is_string($remote['id'])) throw new ApiError(502, 'provider_invalid_response', 'OpenAI did not return a file identifier.');
                $stmt = $pdo->prepare('UPDATE documents SET file_id=? WHERE id=?');
                $stmt->execute([$remote['id'], $id]);
                $this->openai->request('POST', 'vector_stores/' . rawurlencode($store) . '/files', ['file_id' => $remote['id'], 'attributes' => ['document_id' => (string)$id]]);
            } catch (Throwable $error) {
                $stmt = $pdo->prepare("UPDATE documents SET status='failed',error=? WHERE id=?");
                $stmt->execute(['Indexing could not start. Remove this document and upload it again after resolving the server issue.', $id]);
                throw $error;
            }
            $stmt = $pdo->prepare('SELECT * FROM documents WHERE id=?');
            $stmt->execute([$id]);
            return documentJson($stmt->fetch());
        } finally {
            $stmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $stmt->execute([$lock]);
        }
    }

    public function delete(int $id): void {
        $pdo = database();
        $lock = 'folio-upload-' . substr(hash('sha256', config('DB_NAME')), 0, 24);
        $stmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $stmt->execute([$lock]);
        if ((int)$stmt->fetchColumn() !== 1) throw new ApiError(409, 'workspace_busy', 'An upload or removal is in progress. Please try again.');
        try { $this->deleteLocked($id); }
        finally {
            $stmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $stmt->execute([$lock]);
        }
    }

    private function deleteLocked(int $id): void {
        $pdo = database();
        $stmt = $pdo->prepare('SELECT * FROM documents WHERE id=?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) throw new ApiError(404, 'document_not_found', 'Document no longer exists.');
        $stmt = $pdo->prepare("UPDATE documents SET status='deleting',error=NULL WHERE id=?");
        $stmt->execute([$id]);
        try {
            if ($row['file_id']) {
                if ($row['vector_store_id']) $this->openai->request('DELETE', 'vector_stores/' . rawurlencode($row['vector_store_id']) . '/files/' . rawurlencode($row['file_id']), null, false, true);
                $this->openai->request('DELETE', 'files/' . rawurlencode($row['file_id']), null, false, true);
            }
            $path = storagePath() . DIRECTORY_SEPARATOR . basename($row['storage_name']);
            if (is_file($path) && !unlink($path)) throw new ApiError(503, 'storage_unavailable', 'Could not remove the local copy. Try deleting again.');
            $stmt = $pdo->prepare('DELETE FROM documents WHERE id=?');
            $stmt->execute([$id]);
        } catch (Throwable $error) {
            $stmt = $pdo->prepare("UPDATE documents SET status='failed',error=? WHERE id=?");
            $stmt->execute(['Removal is incomplete. This document is excluded from answers. Try deleting again.', $id]);
            throw $error;
        }
    }
}
