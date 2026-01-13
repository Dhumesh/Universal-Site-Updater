<?php
// C:/xampp/xampp/htdocs/site/admin/api.php

header('Content-Type: application/json');

// Root directory helper (Parent of admin folder)
// If admin is in /site/admin/, root is /site/
$rootDir = realpath(__DIR__ . '/..');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'scan_server':
        echo json_encode(scanDirectory($rootDir));
        break;

    case 'upload_file':
        handleUpload($rootDir);
        break;
        
    case 'list_dir':
        $sub = $_GET['path'] ?? '';
        echo json_encode(listSpecificDir($rootDir, $sub));
        break;

    case 'check_files':
        $input = json_decode(file_get_contents('php://input'), true);
        $files = $input['files'] ?? [];
        echo json_encode(checkFiles($rootDir, $files));
        break;

    default:
        echo json_encode(['error' => 'Invalid action']);
        break;
}

function checkFiles($rootDir, $files) {
    $result = [];
    foreach ($files as $file) {
        // Security check: prevent directory traversal
        $cleanPath = normalizePath($file);
        $fullPath = $rootDir . DIRECTORY_SEPARATOR . $cleanPath;
        
        // Normalize slashes for key consistency
        $key = str_replace('\\', '/', $cleanPath);

        if (file_exists($fullPath) && is_file($fullPath)) {
            $result[$key] = [
                'type' => 'file',
                'size' => filesize($fullPath),
                'mtime' => filemtime($fullPath)
            ];
        }
    }
    return $result;
}

function scanDirectory($dir) {
    $result = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $file) {
        $path = $file->getPathname();
        
        // Exclude the 'admin' directory itself to prevent self-overwriting logic issues
        if (strpos($path, 'admin') !== false) {
            continue;
        }

        $relativePath = str_replace($dir . DIRECTORY_SEPARATOR, '', $path);
        // Normalize slashes for consistency
        $relativePath = str_replace('\\', '/', $relativePath);

        if ($file->isFile()) {
            $result[$relativePath] = [
                'type' => 'file',
                'size' => $file->getSize(),
                'mtime' => $file->getMTime()
            ];
        } 
        // We generally track files for sync comparison, but folders can be tracked if needed.
        // For this app, file presence is the main indicator.
    }
    return $result;
}

function normalizePath($path) {
    // Prevent directory traversal attacks
    $path = str_replace(['../', '..\\'], '', $path);
    return $path;
}

function handleUpload($rootDir) {
    if (!isset($_FILES['file']) || !isset($_POST['path'])) {
        echo json_encode(['success' => false, 'error' => 'Missing file or path']);
        return;
    }

    $relativePath = normalizePath($_POST['path']);
    $targetPath = $rootDir . DIRECTORY_SEPARATOR . $relativePath;
    $directory = dirname($targetPath);

    if (!is_dir($directory)) {
        mkdir($directory, 0755, true);
    }

    if (move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Failed to move uploaded file']);
    }
}

function listSpecificDir($rootDir, $subPath) {
    $subPath = normalizePath($subPath);
    $targetDir = $rootDir;
    if ($subPath) {
        $targetDir .= DIRECTORY_SEPARATOR . $subPath;
    }
    
    if (!is_dir($targetDir)) {
        return ['error' => 'Directory not found'];
    }

    $items = [];
    $scanned = scandir($targetDir);
    
    foreach ($scanned as $item) {
        if ($item === '.' || $item === '..') continue;
        
        // Hide admin folder from root view if desired, but user asked for full access.
        // We'll keep it visible but maybe uneditable in frontend if needed.
        
        $fullPath = $targetDir . DIRECTORY_SEPARATOR . $item;
        $isDir = is_dir($fullPath);
        
        $items[] = [
            'name' => $item,
            'type' => $isDir ? 'folder' : 'file',
            'path' => $subPath ? $subPath . '/' . $item : $item,
            'size' => $isDir ? 0 : filesize($fullPath)
        ];
    }
    
    return $items;
}
