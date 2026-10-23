<?php
declare(strict_types=1);

final class Audio {
    public function __construct(private readonly OpenAI $openai) {}

    public function transcribe(array $file): string {
        rateLimit('transcribe', 20, 600);
        if (config('OPENAI_API_KEY') === '') throw new ApiError(503, 'setup_required', 'Add an OpenAI API key to enable voice questions.');
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) throw new ApiError(400, 'audio_upload_failed', 'Recording could not be uploaded. Try recording again.');
        $size = filesize($file['tmp_name']);
        if ($size === false || $size < 1 || $size > 10 * 1024 * 1024) throw new ApiError(413, 'audio_size', 'Recording must be no larger than 10 MB.');
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $extension = match ($mime) {
            'audio/webm', 'video/webm' => 'webm',
            'audio/mp4', 'video/mp4', 'audio/x-m4a', 'application/mp4' => 'mp4',
            'audio/mpeg', 'audio/mp3' => 'mp3',
            'audio/wav', 'audio/x-wav', 'audio/vnd.wave' => 'wav',
            default => null,
        };
        if ($extension === null) throw new ApiError(415, 'audio_type', 'This recording format is unsupported. Use a browser that records WebM or MP4 audio, or type your question.');
        // Browser recordings stop at 60 seconds. Backend independently bounds bytes and request rate.
        // Audio remains in PHP's temporary upload storage and is removed at request end.
        $result = $this->openai->request('POST', 'audio/transcriptions', ['model' => config('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe'), 'file' => new CURLFile($file['tmp_name'], (string)$mime, 'question.' . $extension), 'response_format' => 'json'], true);
        if (!is_string($result['text'] ?? null)) throw new ApiError(502, 'transcript_invalid', 'OpenAI returned an unreadable transcript. Please try again.');
        $text = trim($result['text']);
        if ($text === '') throw new ApiError(422, 'no_speech', 'No clear speech was detected. Try again or type your question.');
        if (mb_strlen($text) > 4000) throw new ApiError(422, 'transcript_too_long', 'Recording produced a question longer than 4,000 characters. Record a shorter question.');
        return $text;
    }

    public static function segments(string $content): array { return speechSegments($content); }

    public function speak(int $messageId, string $voice, ?int $segmentIndex=null): string {
        if (!in_array($voice, ['coral', 'alloy', 'sage'], true)) throw new ApiError(400, 'invalid_voice', 'Choose a supported voice.');
        $stmt = database()->prepare("SELECT content,citations FROM messages WHERE id=? AND conversation_id=? AND role='assistant'");
        $stmt->execute([$messageId, conversationId()]);
        $saved = $stmt->fetch();
        $content = $saved['content'] ?? null;
        if (!is_string($content)) throw new ApiError(404, 'message_not_found', 'This answer is not available in your current conversation.');
        if($segmentIndex!==null){$segments=self::segments($content);if($segmentIndex<0||!isset($segments[$segmentIndex]))throw new ApiError(400,'invalid_speech_segment','Choose a valid spoken segment.');$content=$segments[$segmentIndex];}
        $text = ($saved['citations'] ?? '[]') !== '[]' ? (preg_replace('/ (?:\[\d+\])+(?=\n\n|$)/u', '', $content) ?? $content) : $content;
        if (mb_strlen($text) > 4096) throw new ApiError(422, 'speech_too_long', 'This saved answer is too long to read aloud. Ask a narrower question.');
        $directory=storagePath().'/tts';if(!is_dir($directory)&&!mkdir($directory,0700,true)&&!is_dir($directory))throw new ApiError(503,'speech_unavailable','Audio cache is unavailable.');
        $key=hash('sha256',config('OPENAI_TTS_MODEL','gpt-4o-mini-tts')."\0".$voice."\0".$text);$path=$directory.'/'.$key.'.mp3';
        if(is_file($path)&&!is_link($path)){ $cached=file_get_contents($path);if(is_string($cached)&&$cached!=='')return $cached; }
        rateLimit($segmentIndex===null?'speech':'speech-segment',$segmentIndex===null?30:90,600);
        $audio=$this->openai->speech($text,$voice);$temporary=$directory.'/'.$key.'.'.bin2hex(random_bytes(6)).'.tmp';
        if(file_put_contents($temporary,$audio,LOCK_EX)!==false){chmod($temporary,0600);if(!rename($temporary,$path))@unlink($temporary);}
        $removed=0;foreach(glob($directory.'/*.mp3')?:[] as $old){if($removed>=20)break;if(!is_link($old)&&is_file($old)&&filemtime($old)<time()-86400){@unlink($old);$removed++;}}
        return $audio;
    }
}
