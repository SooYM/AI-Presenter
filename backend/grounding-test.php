<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/Chat.php';

$sources = [['source' => 0, 'fileId' => 'file-test', 'text' => 'The office opens at 09:00. It does not open on Sunday.']];
$documents = ['file-test' => ['id' => 1, 'name' => 'hours.txt']];
$cases = [
    ['valid quotation', ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => 'The office opens at 09:00.']]], 1],
    ['fabricated answer', ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => 'The office opens at 10:00.']]], 0],
    ['negation altered', ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => 'It does open on Sunday.']]], 0],
    ['unknown source', ['answerable' => true, 'excerpts' => [['source' => 8, 'quote' => 'The office opens at 09:00.']]], 0],
    ['no evidence', ['answerable' => false, 'excerpts' => []], 0],
    ['valid evidence survives an invalid extra quote', ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => 'The office opens at 09:00.'], ['source' => 0, 'quote' => 'Sundays open.']]], 1],
    ['invalid data types', ['answerable' => true, 'excerpts' => [['source' => '0', 'quote' => 'The office opens at 09:00.']]], 0],
    ['non-boolean answerable', ['answerable' => 'true', 'excerpts' => [['source' => 0, 'quote' => 'The office opens at 09:00.']]], 0],
    ['too many citations', ['answerable' => true, 'excerpts' => array_fill(0, 5, ['source' => 0, 'quote' => 'The office opens at 09:00.'])], 0],
    ['oversized speech excerpt', ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => str_repeat('a', 901)]]], 0],
];
foreach ($cases as [$name, $selection, $expected]) {
    if (count(Chat::verifiedCitations($selection, $sources, $documents)) !== $expected) { fwrite(STDERR, "FAIL: $name\n"); exit(1); }
    echo "PASS: $name\n";
}
if (Chat::verifiedCitations($cases[0][1], $sources, []) !== []) { fwrite(STDERR, "FAIL: removed document\n"); exit(1); }
echo "PASS: removed document\n";

$markdown = [['source' => 0, 'fileId' => 'file-test', 'text' => "**Dates:**\r\n15, 16 and 17 August 2027.\r\nThe event does not open on Sunday."]];
$selection = ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => "**Dates:**\n15, 16 and 17 August 2027."]]];
$verified = Chat::verifiedCitations($selection, $markdown, $documents);
if (count($verified) !== 1 || $verified[0]['quote'] !== "**Dates:**\r\n15, 16 and 17 August 2027.") { fwrite(STDERR, "FAIL: original Markdown line endings preserved\n"); exit(1); }
echo "PASS: original Markdown line endings preserved\n";
$selection['excerpts'][0]['quote'] = '**Dates:** 15, 16 and 17 August 2027.';
if (count(Chat::verifiedCitations($selection, $markdown, $documents)) !== 1) { fwrite(STDERR, "FAIL: whitespace-only model normalization\n"); exit(1); }
echo "PASS: whitespace-only model normalization\n";
$selection['excerpts'][0]['quote'] = 'Dates: 15, 16 and 17 August 2027.';
if (Chat::verifiedCitations($selection, $markdown, $documents) !== []) { fwrite(STDERR, "FAIL: Markdown text cannot be rewritten\n"); exit(1); }
echo "PASS: Markdown text cannot be rewritten\n";
$selection['excerpts'] = [['source' => 0, 'quote' => 'The event does open on Sunday.'], ['source' => 0, 'quote' => '**Dates:** 15, 16 and 17 August 2027.']];
$verified = Chat::verifiedCitations($selection, $markdown, $documents);
if (count($verified) !== 1 || str_contains($verified[0]['quote'], 'does open')) { fwrite(STDERR, "FAIL: invalid negation excluded from partial evidence\n"); exit(1); }
echo "PASS: invalid negation excluded from partial evidence\n";
$selection['excerpts'] = array_fill(0, 2, ['source' => 0, 'quote' => '**Dates:** 15, 16 and 17 August 2027.']);
if (count(Chat::verifiedCitations($selection, $markdown, $documents)) !== 1) { fwrite(STDERR, "FAIL: repeated source quote deduplicated\n"); exit(1); }
echo "PASS: repeated source quote deduplicated\n";

$chunkSources = [
    ['source' => 0, 'fileId' => 'file-test', 'text' => 'Dates: 15, 16 and 17 August 2027.'],
    ['source' => 1, 'fileId' => 'file-markdown', 'text' => '**Dates:** 15, 16 and 17 August 2027.'],
];
$chunkDocuments = $documents + ['file-markdown' => ['id' => 2, 'name' => 'convention.md']];
$selection = ['answerable' => true, 'excerpts' => [['source' => 0, 'quote' => '**Dates:** 15, 16 and 17 August 2027.']]];
$verified = Chat::verifiedCitations($selection, $chunkSources, $chunkDocuments);
if (count($verified) !== 1 || $verified[0]['documentId'] !== 2 || $verified[0]['name'] !== 'convention.md') { fwrite(STDERR, "FAIL: wrong chunk number repaired with exact source\n"); exit(1); }
echo "PASS: wrong chunk number repaired with exact source\n";
if (Chat::verifiedCitations($selection, $chunkSources, $documents) !== []) { fwrite(STDERR, "FAIL: source repair cannot use an unselected document\n"); exit(1); }
echo "PASS: source repair cannot use an unselected document\n";
$selection['excerpts'][0]['source'] = 9;
if (Chat::verifiedCitations($selection, $chunkSources, $chunkDocuments) !== []) { fwrite(STDERR, "FAIL: out-of-range chunk remains invalid\n"); exit(1); }
echo "PASS: out-of-range chunk remains invalid\n";
