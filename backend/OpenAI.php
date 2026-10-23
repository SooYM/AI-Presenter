<?php
declare(strict_types=1);

final class OpenAI {
    public function speech(string $text, string $voice): string {
        if (config('OPENAI_API_KEY') === '') throw new ApiError(503, 'setup_required', 'Add an OpenAI API key to enable spoken answers.');
        $curl = curl_init('https://api.openai.com/v1/audio/speech');
        curl_setopt_array($curl, [CURLOPT_POST => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . config('OPENAI_API_KEY'), 'Content-Type: application/json', 'Accept: audio/mpeg'], CURLOPT_POSTFIELDS => json_encode(['model' => config('OPENAI_TTS_MODEL', 'gpt-4o-mini-tts'), 'voice' => $voice, 'input' => $text, 'response_format' => 'mp3'], JSON_THROW_ON_ERROR), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 60, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
        $audio = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $type = (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
        $errno = curl_errno($curl);
        curl_close($curl);
        if ($audio === false || $errno !== 0) throw new ApiError(502, 'speech_unavailable', 'Spoken audio did not arrive. You can still read the answer.');
        if ($status < 200 || $status >= 300) {
            error_log(json_encode(['event' => 'openai_speech_failed', 'status' => $status, 'requestId' => $GLOBALS['requestId'] ?? 'cli']));
            throw new ApiError($status === 429 ? 503 : 502, 'speech_unavailable', 'OpenAI could not create spoken audio. Check account access or try later.');
        }
        if ($audio === '' || (!str_starts_with($type, 'audio/') && !str_starts_with($type, 'application/octet-stream'))) throw new ApiError(502, 'speech_invalid', 'OpenAI returned an unreadable audio response.');
        return $audio;
    }

    public function request(string $method, string $path, ?array $body = null, bool $multipart = false, bool $allowMissing = false): array {
        if (config('OPENAI_API_KEY') === '') throw new ApiError(503, 'setup_required', 'The server needs an OpenAI API key.');
        $curl = curl_init('https://api.openai.com/v1/' . ltrim($path, '/'));
        $headers = ['Authorization: Bearer ' . config('OPENAI_API_KEY'), 'Accept: application/json'];
        if (!$multipart) $headers[] = 'Content-Type: application/json';
        curl_setopt_array($curl, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => $multipart ? 90 : 60, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
        if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $multipart ? $body : json_encode($body, JSON_THROW_ON_ERROR));
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $errno = curl_errno($curl);
        curl_close($curl);
        if ($raw === false || $errno !== 0) throw new ApiError(502, 'provider_unavailable', 'OpenAI did not respond. Please try again.');
        if ($allowMissing && $status === 404) return [];
        if ($status < 200 || $status >= 300) {
            // Never expose provider bodies, API keys, document contents or upstream details.
            error_log(json_encode(['event' => 'openai_request_failed', 'status' => $status, 'requestId' => $GLOBALS['requestId'] ?? 'cli']));
            $message = $status === 429 ? 'OpenAI capacity or account quota is unavailable. Please try later or check billing.' : 'OpenAI could not complete this request. Check server configuration and try again.';
            throw new ApiError($status === 429 ? 503 : 502, 'provider_error', $message);
        }
        try { $result = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
        catch (JsonException) { throw new ApiError(502, 'provider_invalid_response', 'OpenAI returned an unreadable response.'); }
        if (!is_array($result)) throw new ApiError(502, 'provider_invalid_response', 'OpenAI returned an unreadable response.');
        return $result;
    }

    public function vectorStore(): string {
        $pdo = database();
        $lock = 'folio-vs-' . substr(hash('sha256', config('DB_NAME')), 0, 32);
        $stmt = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $stmt->execute([$lock]);
        if ((int)$stmt->fetchColumn() !== 1) throw new ApiError(409, 'workspace_busy', 'Workspace is busy. Please try again.');
        try {
            $id = $pdo->query("SELECT setting_value FROM settings WHERE setting_key='vector_store_id'")->fetchColumn();
            if ($id !== false) return (string)$id;
            $result = $this->request('POST', 'vector_stores', ['name' => 'AI Presenter private documents']);
            if (!isset($result['id']) || !is_string($result['id'])) throw new ApiError(502, 'provider_invalid_response', 'Document index could not be created.');
            $stmt = $pdo->prepare("INSERT INTO settings (setting_key,setting_value) VALUES ('vector_store_id',?)");
            $stmt->execute([$result['id']]);
            return $result['id'];
        } finally {
            $stmt = $pdo->prepare('SELECT RELEASE_LOCK(?)');
            $stmt->execute([$lock]);
        }
    }
}
