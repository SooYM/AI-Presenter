<?php
declare(strict_types=1);

require_once __DIR__ . '/GroundedPresenter.php';

final class Chat {
    public const REFUSAL = "I couldn't find an answer in your selected documents. Try a more specific question or upload a document that covers this topic.";
    public function __construct(private readonly OpenAI $openai) {}

    public function answer(string $question, array $documentIds = [], ?int $presentationId = null, ?int $page = null, string $language = 'auto'): array {
        $question = trim($question);
        if ($question === '' || mb_strlen($question) > 4000) throw new ApiError(400,'invalid_question','Enter a question between 1 and 4,000 characters.');
        if (!in_array($language,['auto','en','zh'],true)) throw new ApiError(400,'invalid_language','Choose English, Chinese or automatic language.');
        if (($presentationId === null) !== ($page === null) || ($presentationId !== null && ($presentationId < 1 || $page < 1))) throw new ApiError(400,'invalid_presentation','Choose a valid presentation and slide.');
        rateLimit('chat',20,600);
        $evidence = $presentationId !== null && $documentIds === [] ? ['sources'=>[],'allowed'=>[]] : $this->retrieve($question,$documentIds);
        if ($presentationId !== null) {
            if (!class_exists('Presentations')) throw new ApiError(503,'presentation_unavailable','Presentation questions are not available yet.');
            $slideEvidence = Presentations::questionSources($presentationId,$page,$question);
            $evidence['allowed'] += $slideEvidence['allowed'];
            // Current-slide evidence comes first; local retrieval has already scoped support documents.
            $evidence['sources'] = array_merge($slideEvidence['sources'],$evidence['sources']);
        }
        if ($evidence['sources'] === [] && $presentationId === null && $evidence['allowed'] === []) throw new ApiError(409,'no_documents','Upload a document and wait for indexing before asking a question.');
        foreach ($evidence['sources'] as $index => &$source) $source['source'] = $index;
        unset($source);
        $answer = (new GroundedPresenter($this->openai))->compose($question,$evidence['sources'],$evidence['allowed'],$language,'answer');
        $pdo = database(); $checked = [];
        foreach ($answer['citations'] as $citation) {
            if (isset($citation['presentationId'],$citation['page'])) {
                $key = $citation['presentationId'].':'.$citation['page'];
                if (!isset($checked[$key])) { Presentations::questionSources($citation['presentationId'],$citation['page'],$question); $checked[$key] = true; }
            } else {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM documents WHERE id=? AND status='ready'");
                $stmt->execute([$citation['documentId']]);
                if ((int)$stmt->fetchColumn() !== 1) throw new ApiError(409,'documents_changed','Documents changed while answering. Please ask again.');
            }
        }
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('INSERT INTO messages (conversation_id,role,content,citations) VALUES (?,?,?,?)');
            $stmt->execute([conversationId(),'user',$question,'[]']);
            $stmt->execute([conversationId(),'assistant',$answer['content'],json_encode($answer['citations'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);
            $id = (int)$pdo->lastInsertId(); $pdo->commit();
        } catch (Throwable $error) { $pdo->rollBack(); throw $error; }
        $stmt = $pdo->prepare('SELECT * FROM messages WHERE id=?'); $stmt->execute([$id]);
        return messageJson($stmt->fetch());
    }

    /** Read-only evidence retrieval, also reusable for a slide's supporting documents. */
    public function retrieve(string $question, array $documentIds = []): array {
        if (count($documentIds) > 30) throw new ApiError(400,'invalid_documents','Select no more than 30 documents.');
        foreach ($documentIds as $id) if (!is_int($id) || $id < 1) throw new ApiError(400,'invalid_documents','Document identifiers must be positive integers.');
        $rows = database()->query("SELECT * FROM documents WHERE status='ready'")->fetchAll();
        if ($documentIds !== []) {
            $rows = array_values(array_filter($rows,fn(array $row):bool=>in_array((int)$row['id'],$documentIds,true)));
            if (count($rows) !== count(array_unique($documentIds))) throw new ApiError(409,'documents_not_ready','One or more selected documents are unavailable. Refresh the document list.');
        }
        $allowed = []; $sources = [];
        foreach ($rows as $row) $allowed[$row['file_id']] = $row;
        if ($rows === []) return ['sources'=>[],'allowed'=>[]];
        $results = $this->openai->request('POST','vector_stores/'.rawurlencode($rows[0]['vector_store_id']).'/search',[
            'query'=>mb_substr($question,0,4000),'max_num_results'=>8,'rewrite_query'=>true,
            'filters'=>['type'=>'in','key'=>'document_id','value'=>array_map(fn(array $row):string=>(string)$row['id'],$rows)],
            'ranking_options'=>['ranker'=>'auto','score_threshold'=>max(0.0,min(1.0,(float)config('RAG_SCORE_THRESHOLD','0.35')))],
        ]);
        foreach ($results['data'] ?? [] as $result) {
            if (!isset($allowed[$result['file_id'] ?? ''])) continue;
            foreach ($result['content'] ?? [] as $part) {
                if (($part['type'] ?? '') !== 'text' || !is_string($part['text'] ?? null) || trim($part['text']) === '') continue;
                $sources[] = ['source'=>count($sources),'fileId'=>$result['file_id'],'text'=>mb_substr($part['text'],0,12000)];
                if (count($sources) >= 8) break 2;
            }
        }
        return ['sources'=>$sources,'allowed'=>$allowed];
    }

    public static function verifiedCitations(array $selection, array $sources, array $allowed): array {
        return GroundedPresenter::verifiedCitations($selection,$sources,$allowed);
    }
}
