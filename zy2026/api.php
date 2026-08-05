<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data.json';
$allowedNames = [
    '全媒体广告策划与营销',
    '数字媒体技术',
    '数字媒体艺术设计',
    '新闻采编与制作',
    '环境艺术设计',
    '电子竞技运动与管理',
    '视觉传达设计',
    '国际经济与贸易',
    '大数据与财务管理',
    '现代物流管理',
    '电子商务',
    '网络营销与直播电商',
    '连锁经营与管理',
    '旅游管理',
    '西式烹饪工艺',
    '酒店管理与数字化运营',
    '国际邮轮乘务管理',
    '城市轨道车辆应用技术',
    '机场运行服务与管理',
    '民航运输服务',
    '汽车技术服务与营销',
    '港口与航运管理',
    '铁道交通运营管理',
    '铁道机车运用与维护',
    '高速铁路客运服务',
    '医学美容技术',
    '宠物医疗技术',
    '人工智能技术应用',
    '新能源汽车技术',
    '药品生物技术'
];

function respond(int $status, array $payload): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function defaultState(array $allowedNames): array {
    $selected = [];
    foreach ($allowedNames as $name) {
        $selected[$name] = true;
    }
    return [
        'version' => 1,
        'updatedAt' => '',
        'order' => $allowedNames,
        'selected' => $selected
    ];
}

function readState(string $dataFile, array $allowedNames): array {
    if (!is_file($dataFile)) {
        return defaultState($allowedNames);
    }

    $fp = fopen($dataFile, 'rb');
    if ($fp === false) {
        return defaultState($allowedNames);
    }

    try {
        if (!flock($fp, LOCK_SH)) {
            return defaultState($allowedNames);
        }
        $json = stream_get_contents($fp);
        flock($fp, LOCK_UN);
    } finally {
        fclose($fp);
    }

    $decoded = json_decode($json ?: '', true);
    if (!is_array($decoded)) {
        return defaultState($allowedNames);
    }

    $allowedLookup = array_fill_keys($allowedNames, true);
    $order = [];
    $seen = [];

    if (isset($decoded['order']) && is_array($decoded['order'])) {
        foreach ($decoded['order'] as $name) {
            if (is_string($name) && isset($allowedLookup[$name]) && !isset($seen[$name])) {
                $order[] = $name;
                $seen[$name] = true;
            }
        }
    }
    foreach ($allowedNames as $name) {
        if (!isset($seen[$name])) {
            $order[] = $name;
        }
    }

    $selected = [];
    foreach ($allowedNames as $name) {
        $selected[$name] = true;
        if (isset($decoded['selected']) && is_array($decoded['selected']) && array_key_exists($name, $decoded['selected'])) {
            $selected[$name] = (bool)$decoded['selected'][$name];
        }
    }

    return [
        'version' => isset($decoded['version']) ? (int)$decoded['version'] : 1,
        'updatedAt' => isset($decoded['updatedAt']) && is_string($decoded['updatedAt']) ? $decoded['updatedAt'] : '',
        'order' => $order,
        'selected' => $selected
    ];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    respond(200, ['ok' => true, 'state' => readState($dataFile, $allowedNames)]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$raw = file_get_contents('php://input');
$input = json_decode($raw ?: '', true);
if (!is_array($input)) {
    respond(400, ['ok' => false, 'error' => 'Invalid JSON']);
}

$allowedLookup = array_fill_keys($allowedNames, true);
$order = [];
$seen = [];

if (isset($input['order']) && is_array($input['order'])) {
    foreach ($input['order'] as $name) {
        if (is_string($name) && isset($allowedLookup[$name]) && !isset($seen[$name])) {
            $order[] = $name;
            $seen[$name] = true;
        }
    }
}
foreach ($allowedNames as $name) {
    if (!isset($seen[$name])) {
        $order[] = $name;
    }
}

$selected = [];
foreach ($allowedNames as $name) {
    $selected[$name] = true;
    if (isset($input['selected']) && is_array($input['selected']) && array_key_exists($name, $input['selected'])) {
        $selected[$name] = (bool)$input['selected'][$name];
    }
}

$state = [
    'version' => 1,
    'updatedAt' => gmdate('c'),
    'order' => $order,
    'selected' => $selected
];

$encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
if ($encoded === false) {
    respond(500, ['ok' => false, 'error' => 'Encoding failed']);
}

$tmpFile = $dataFile . '.tmp';
$fp = fopen($tmpFile, 'wb');
if ($fp === false) {
    respond(500, ['ok' => false, 'error' => 'Cannot open temporary file']);
}

$writeOk = false;
try {
    if (!flock($fp, LOCK_EX)) {
        throw new RuntimeException('Cannot lock temporary file');
    }
    $bytes = fwrite($fp, $encoded);
    fflush($fp);
    flock($fp, LOCK_UN);
    $writeOk = ($bytes !== false);
} catch (Throwable $e) {
    $writeOk = false;
} finally {
    fclose($fp);
}

if (!$writeOk || !rename($tmpFile, $dataFile)) {
    @unlink($tmpFile);
    respond(500, ['ok' => false, 'error' => 'Save failed. Check folder write permission.']);
}

respond(200, ['ok' => true, 'state' => $state]);
