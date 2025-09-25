<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

$dataDir = __DIR__ . '/data/';
$required = ['id','name','category','price','stock','rating','created_at'];

error_log("Import.php called, method: " . $_SERVER['REQUEST_METHOD']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    error_log("Method not allowed. Method was: " . $_SERVER['REQUEST_METHOD']);
    http_response_code(405); 
    echo json_encode(['error'=>'Метод не разрешён']); 
    exit;
}

if (!isset($_FILES['products'])) {
    error_log("No file uploaded");
    http_response_code(400); 
    echo json_encode(['error'=>'Файл не загружен']); 
    exit;
}

error_log("File uploaded: " . $_FILES['products']['name']);

$tmp = $_FILES['products']['tmp_name'];
$name = $_FILES['products']['name'];
$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

$items = [];
$errors = [];

function validate_item($row, $index, $required) {
    $errs = [];
    foreach ($required as $f) {
        if (!array_key_exists($f, $row) || $row[$f] === '' || $row[$f] === null) {
            $errs[] = "строка {$index}: отсутствует поле \"{$f}\"";
        }
    }
    if (!empty($errs)) return $errs;
    if (!is_numeric($row['id']) || intval($row['id']) != $row['id']) $errs[] = "строка {$index}: поле id должно быть целым числом";
    if (!is_numeric($row['price']) || $row['price'] < 0) $errs[] = "строка {$index}: поле price должно быть числом >= 0";
    if (!is_numeric($row['stock']) || intval($row['stock']) != $row['stock'] || $row['stock'] < 0) $errs[] = "строка {$index}: поле stock — неотрицательное целое";
    if (!is_numeric($row['rating']) || $row['rating'] < 0 || $row['rating'] > 5) $errs[] = "строка {$index}: поле rating должно быть число от 0 до 5";
    $d = DateTime::createFromFormat('Y-m-d', $row['created_at']);
    if (!$d || $d->format('Y-m-d') !== $row['created_at']) $errs[] = "строка {$index}: поле created_at должно быть в формате YYYY-MM-DD";
    return $errs;
}

if ($ext === 'json') {
    $saveFile = $dataDir . 'products.json';
    $json = file_get_contents($tmp);
    $parsed = json_decode($json, true);
    if ($parsed === null) { 
        http_response_code(400); 
        echo json_encode(['error'=>'Некорректный JSON']); 
        exit; 
    }
    if (!is_array($parsed)) { 
        http_response_code(400); 
        echo json_encode(['error'=>'JSON должен быть массивом объектов']); 
        exit; 
    }
    foreach ($parsed as $i => $row) {
        if (!is_array($row)) { 
            $errors[] = "элемент ".($i+1)." не является объектом"; 
            continue; 
        }
        $items[] = $row;
        $errs = validate_item($row, $i+1, $required);
        if ($errs) $errors = array_merge($errors, $errs);
    }
} elseif ($ext === 'csv') {
    $saveFile = $dataDir . 'products.csv';
    $content = file($tmp, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$content || count($content) < 2) { 
        http_response_code(400); 
        echo json_encode(['error'=>'CSV пустой или содержит только заголовок']); 
        exit; 
    }
    $content[0] = preg_replace('/^\xEF\xBB\xBF/', '', $content[0]);

    $header = str_getcsv(array_shift($content), ',', '"', '\\');
    $header = array_map('trim', $header);

    foreach ($required as $f) {
        if (!in_array($f, $header, true)) {
            http_response_code(400);
            echo json_encode(['error'=>"В CSV отсутствует обязательное поле \"$f\""]);
            exit;
        }
    }

    foreach ($content as $lineNo => $line) {
        $rowArr = str_getcsv($line, ',', '"', '\\');
        if (count($rowArr) !== count($header)) {
            $errors[] = "строка ".($lineNo+2).": количество колонок не соответствует заголовку";
            continue;
        }
        $assoc = array_combine($header, $rowArr);
        foreach ($assoc as $k=>$v) $assoc[$k] = trim($v);
        $items[] = $assoc;
        $errs = validate_item($assoc, $lineNo+2, $required);
        if ($errs) $errors = array_merge($errors, $errs);
    }
} else {
    http_response_code(400); 
    echo json_encode(['error'=>'Файл должен быть .json или .csv']); 
    exit;
}

if (!empty($errors)) {
    http_response_code(422); 
    echo json_encode(['error'=>'Валидация не пройдена','details'=>$errors]); 
    exit;
}

if (!is_dir($dataDir)) {
    if (!mkdir($dataDir, 0755, true)) {
        http_response_code(500); 
        echo json_encode(['error'=>'Не удалось создать папку для данных']); 
        exit;
    }
}

if ($ext === 'json') {
    $normalized = [];
    foreach ($items as $row) {
        $normalized[] = [
            'id' => intval($row['id']),
            'name' => (string)($row['name'] ?? ''),
            'category' => (string)($row['category'] ?? ''),
            'price' => floatval($row['price']),
            'stock' => intval($row['stock']),
            'rating' => floatval($row['rating']),
            'reviews_count' => isset($row['reviews_count']) ? intval($row['reviews_count']) : 0,
            'created_at' => $row['created_at'],
            'image' => isset($row['image']) ? $row['image'] : null,
            'promo' => $row['promo'] ?? null,
            'description' => $row['description'] ?? null
        ];
    }
    
    if (file_put_contents($saveFile, json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
        http_response_code(500); 
        echo json_encode(['error'=>'Не удалось записать JSON файл']); 
        exit;
    }
} else { 
    
    $csvContent = '';
    
    $headers = ['id','name','category','price','stock','rating','created_at','reviews_count','image','promo','description'];
    $csvContent .= implode(',', $headers) . "\n";
    
    foreach ($items as $row) {
        $csvLine = [];
        foreach ($headers as $header) {
            $value = $row[$header] ?? '';
            if (strpos($value, ',') !== false || strpos($value, '"') !== false) {
                $value = '"' . str_replace('"', '""', $value) . '"';
            }
            $csvLine[] = $value;
        }
        $csvContent .= implode(',', $csvLine) . "\n";
    }
    
    if (file_put_contents($saveFile, $csvContent) === false) {
        http_response_code(500); 
        echo json_encode(['error'=>'Не удалось записать CSV файл']); 
        exit;
    }
}

error_log("Successfully imported " . count($items) . " items to " . $saveFile);
echo json_encode(['success'=>true, 'count'=>count($items), 'format'=>$ext]);
?>