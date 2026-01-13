/* C:/xampp/xampp/htdocs/site/admin/app.js */

const API_URL = 'api.php';

// State
let localFiles = new Map(); // path -> File
let serverFiles = new Map(); // path -> {size, type}
let syncList = []; // Array of comparison objects
let currentServerPath = '';
let statusChart = null;

// DOM Elements
const tabs = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('section');
const folderInput = document.getElementById('folder-input');
const btnCompare = document.getElementById('btn-compare');
const btnUpload = document.getElementById('btn-upload');
const syncResults = document.getElementById('sync-results');
const syncTableBody = document.getElementById('sync-table-body');
const checkAll = document.getElementById('check-all');
const statsInfo = document.getElementById('stats-info');

const managerTableBody = document.getElementById('manager-table-body');
const serverBreadcrumbs = document.getElementById('server-breadcrumbs');

// Init
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupSync();
    setupManager();
});

function setupTabs() {
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // UI Toggle
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            sections.forEach(s => s.classList.remove('active-section'));
            document.getElementById(`${tab.dataset.tab}-section`).classList.add('active-section');

            // Logic trigger
            if (tab.dataset.tab === 'manager') {
                loadServerDir('');
            }
        });
    });
}

// ============================================
// SECTION 1: SYNC
// ============================================

function setupSync() {
    // Drag & Drop Listeners
    const dropZone = document.getElementById('drop-zone');

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        // Prevent flickering when hovering over children
        if (!dropZone.contains(e.relatedTarget)) {
            dropZone.classList.remove('drag-over');
        }
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        resetSyncState();
        statsInfo.textContent = 'Scanning dropped folder...';

        try {
            const files = [];
            // We assume the user drops one folder, or multiple files
            // We need to traverse them
            const queue = [];
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
                if (entry) queue.push(entry);
            }

            for (const entry of queue) {
                const results = await scanFileEntry(entry);
                files.push(...results);
            }

            processFiles(files);

        } catch (err) {
            console.error(err);
            statsInfo.textContent = 'Error processing dropped files.';
        }
    });

    folderInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        resetSyncState();

        // Convert to array of objects with 'path' and 'file' properties for consistency
        const processed = files.map(f => {
            const parts = f.webkitRelativePath.split('/');
            parts.shift(); // Remove root folder name
            return {
                path: parts.join('/'),
                file: f
            };
        }).filter(item => item.path); // Filter empty paths if any

        processFiles(processed);
    });

    btnCompare.addEventListener('click', async () => {
        statsInfo.textContent = 'Checking server status...';
        btnCompare.disabled = true;

        try {
            // Optimization: Only check files we have locally
            const filePaths = Array.from(localFiles.keys());

            const response = await fetch(`${API_URL}?action=check_files`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filePaths })
            });

            const data = await response.json();

            serverFiles.clear();
            for (const [path, info] of Object.entries(data)) {
                serverFiles.set(path, info);
            }

            compareFiles();

        } catch (err) {
            console.error(err);
            statsInfo.textContent = 'Error fetching server data.';
            btnCompare.disabled = false;
        }
    });

    checkAll.addEventListener('change', (e) => {
        const checkboxes = syncTableBody.querySelectorAll('.row-check');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    btnUpload.addEventListener('click', startBatchUpload);
}

function resetSyncState() {
    localFiles.clear();
    btnCompare.disabled = true;
    btnUpload.disabled = true;
    syncResults.classList.add('hidden');
    document.getElementById('chart-section').classList.add('hidden');
    document.getElementById('action-bar').classList.remove('hidden'); // Show action bar on file selection
}

function processFiles(fileList) {
    // fileList is Array of {path: "css/style.css", file: FileObj}

    for (const item of fileList) {
        localFiles.set(item.path, item.file);
    }

    statsInfo.textContent = `${localFiles.size} files ready to compare.`;
    btnCompare.disabled = false;
    btnCompare.classList.add('primary');
}

// Helper to recursively scan dropped entries
async function scanFileEntry(entry, path = '') {
    return new Promise((resolve) => {
        if (entry.isFile) {
            entry.file(file => {
                // entry.fullPath includes the leading slash, e.g. "/Project/index.html"
                const fullParts = entry.fullPath.split('/');

                // Remove leading empty string if present (from leading slash)
                if (fullParts[0] === '') fullParts.shift();

                // If the first part is the name of the dropped folder, remove it.
                // This mimics webkitRelativePath behavior for folder selection.
                // If a file is dropped directly, fullParts will just be [filename].
                // If a folder is dropped, fullParts will be [foldername, path, to, file].
                // We want to strip the top-level folder name.
                let relativePath;
                if (fullParts.length > 1) { // It's a file inside a dropped folder
                    fullParts.shift(); // Remove the top-level folder name
                    relativePath = fullParts.join('/');
                } else { // It's a file dropped directly, or a file at the root of a dropped folder
                    relativePath = fullParts.join('/');
                }

                if (relativePath) {
                    resolve([{ path: relativePath, file: file }]);
                } else {
                    resolve([]); // Should not happen if file is valid, but good for safety
                }
            });
        } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            dirReader.readEntries(async entries => {
                const tasks = entries.map(e => scanFileEntry(e, path + entry.name + '/'));
                const results = await Promise.all(tasks);
                resolve(results.flat());
            });
        } else {
            resolve([]); // Ignore non-file/directory entries
        }
    });
}

function compareFiles() {
    syncList = [];
    let stats = { new: 0, updated: 0, unchanged: 0 };

    // Check Local files against Server
    localFiles.forEach((file, path) => {
        let status = 'new';
        const serverFile = serverFiles.get(path);

        if (serverFile) {
            // Compare sizes (approximate check, good enough for most basic updates)
            if (serverFile.size === file.size) {
                status = 'unchanged';
            } else {
                status = 'updated';
            }
        }

        stats[status]++;

        syncList.push({
            path,
            file,
            status,
            size: file.size
        });
    });

    renderSyncTable();
    renderChart(stats);
    statsInfo.textContent = 'Comparison complete.';
    btnUpload.disabled = false;
}

function renderChart(stats) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    const legendContainer = document.getElementById('chart-legend');
    document.getElementById('chart-section').classList.remove('hidden');

    if (statusChart) {
        statusChart.destroy();
    }

    // Colors matching use r reference
    const colors = {
        new: '#22c55e',      // Green (Success)
        updated: '#f97316',  // Orange
        unchanged: '#1e293b' // Dark Blue (Slate 800)
    };

    const config = {
        type: 'pie',
        data: {
            labels: ['New', 'Updated', 'Unchanged'],
            datasets: [{
                data: [stats.new, stats.updated, stats.unchanged],
                backgroundColor: [
                    colors.new,
                    colors.updated,
                    colors.unchanged
                ],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100) + '%';
                            return ` ${context.label}: ${value} (${percentage})`;
                        }
                    }
                }
            }
        }
    };

    statusChart = new Chart(ctx, config);

    // Render Custom Legend (Bubble Style)
    const items = [
        { label: 'Unchanged Files', desc: 'Existing files with matching size.', count: stats.unchanged, color: colors.unchanged, icon: 'A' },
        { label: 'Updated Files', desc: 'Files modified locally.', count: stats.updated, color: colors.updated, icon: 'B' },
        { label: 'New Files', desc: 'Files added to the project.', count: stats.new, color: colors.new, icon: 'C' }
    ];

    legendContainer.innerHTML = items.map(item => `
        <div class="legend-item">
            <div class="legend-circle-icon" style="background: ${item.color}">${item.icon}</div>
            <div class="legend-info">
                <span class="legend-count" style="color: #0f172a">${item.label} (${item.count})</span>
                <span class="legend-description">${item.desc}</span>
            </div>
        </div>
    `).join('');
}

function renderSyncTable() {
    syncTableBody.innerHTML = '';

    // Sort: New & Updated first, then Unchanged
    syncList.sort((a, b) => {
        const rank = { 'new': 1, 'updated': 2, 'unchanged': 3 };
        return rank[a.status] - rank[b.status];
    });

    const total = syncList.length;
    const CHUNK_SIZE = 50;
    let currentIndex = 0;

    statsInfo.textContent = `Rendering results (0/${total})...`;

    function renderNextChunk() {
        const chunk = syncList.slice(currentIndex, currentIndex + CHUNK_SIZE);

        if (chunk.length === 0) {
            syncResults.classList.remove('hidden');
            checkAll.checked = false;
            statsInfo.textContent = 'Comparison complete.';
            return;
        }

        const fragment = document.createDocumentFragment();

        chunk.forEach(item => {
            const row = document.createElement('div');
            row.className = 'table-row';

            const isChecked = item.status !== 'unchanged'; // Default tick for New/Updated
            const checkState = isChecked ? 'checked' : '';

            row.innerHTML = `
                <div class="col-check">
                    <input type="checkbox" class="row-check" data-path="${item.path}" ${checkState}>
                </div>
                <div class="col-name" title="${item.path}">${item.path}</div>
                <div class="col-status">
                    <span class="status-badge status-${item.status}">${item.status}</span>
                </div>
                <div class="col-size">${formatSize(item.size)}</div>
            `;
            fragment.appendChild(row);
        });

        syncTableBody.appendChild(fragment);
        currentIndex += CHUNK_SIZE;
        statsInfo.textContent = `Rendering results (${Math.min(currentIndex, total)}/${total})...`;

        // Schedule next chunk
        requestAnimationFrame(renderNextChunk);
    }

    renderNextChunk();
}

async function startBatchUpload() {
    const checkboxes = syncTableBody.querySelectorAll('.row-check:checked');
    if (checkboxes.length === 0) return;

    btnUpload.disabled = true;
    const total = checkboxes.length;
    let completed = 0;

    statsInfo.textContent = `Uploading 0/${total}...`;

    for (const cb of checkboxes) {
        const path = cb.dataset.path;
        const file = localFiles.get(path);

        try {
            await uploadFile(file, path);

            // Visual Update
            const row = cb.closest('.table-row');
            row.querySelector('.status-badge').textContent = 'Uploaded';
            row.querySelector('.status-badge').className = 'status-badge status-unchanged';
            row.querySelector('.status-badge').style.background = '#4ade8033';
            row.querySelector('.status-badge').style.color = '#4ade80';

        } catch (err) {
            console.error(`Failed to upload ${path}`, err);
        }

        completed++;
        statsInfo.textContent = `Uploading ${completed}/${total}...`;
    }

    statsInfo.textContent = 'Upload complete.';
    btnUpload.disabled = false;
}

async function uploadFile(fileObj, relativePath) {
    const formData = new FormData();
    formData.append('action', 'upload_file');
    formData.append('file', fileObj);
    formData.append('path', relativePath);

    const res = await fetch(API_URL, {
        method: 'POST',
        body: formData
    });
    return res.json();
}

// ============================================
// SECTION 2: MANAGER
// ============================================

function setupManager() {
    // Breadcrumbs
    serverBreadcrumbs.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            loadServerDir(e.target.dataset.path || '');
        }
    });

    // Replace Modal Handlers
    document.getElementById('btn-cancel-replace').addEventListener('click', () => {
        document.getElementById('replace-modal').classList.add('hidden');
    });

    document.getElementById('btn-confirm-replace').addEventListener('click', async () => {
        const input = document.getElementById('replace-input');
        const file = input.files[0];
        if (!file) return;

        const path = input.dataset.targetPath;

        // Upload
        const formData = new FormData();
        formData.append('action', 'upload_file');
        formData.append('file', file);
        formData.append('path', path);

        try {
            await fetch(API_URL, { method: 'POST', body: formData });
            document.getElementById('replace-modal').classList.add('hidden');
            loadServerDir(currentServerPath); // Refresh
        } catch (e) {
            alert('Upload failed');
        }
    });
}

async function loadServerDir(path) {
    currentServerPath = path;
    updateBreadcrumbs(path);
    managerTableBody.innerHTML = '<div style="padding:1rem;">Loading...</div>';

    try {
        const res = await fetch(`${API_URL}?action=list_dir&path=${encodeURIComponent(path)}`);
        const files = await res.json();

        if (files.error) {
            managerTableBody.innerHTML = `<div style="padding:1rem;">Error: ${files.error}</div>`;
            return;
        }

        renderManagerTable(files);

    } catch (e) {
        console.error(e);
        managerTableBody.innerHTML = '<div style="padding:1rem;">Error loading directory.</div>';
    }
}

function renderManagerTable(items) {
    managerTableBody.innerHTML = '';

    // Config: Folders first
    items.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'table-row';

        const icon = item.type === 'folder' ? '📁' : '📄';
        const actionHtml = item.type === 'file'
            ? `<button class="action-btn small-btn" onclick="openReplaceModal('${item.path}', '${item.name}')">Replace</button>`
            : '';

        row.innerHTML = `
            <div class="col-icon">${icon}</div>
            <div class="col-name ${item.type === 'folder' ? 'clickable-folder' : ''}" data-path="${item.path}">
                ${item.name}
            </div>
            <div class="col-size">${item.type === 'file' ? formatSize(item.size) : '-'}</div>
            <div class="col-action">${actionHtml}</div>
        `;

        managerTableBody.appendChild(row);
    });

    document.querySelectorAll('.clickable-folder').forEach(el => {
        el.style.cursor = 'pointer';
        el.style.color = 'var(--accent-color)';
        el.addEventListener('click', () => {
            loadServerDir(el.dataset.path);
        });
    });
}

function updateBreadcrumbs(path) {
    const parts = path ? path.split('/') : [];
    let html = `<span data-path="">Root</span>`;
    let current = '';

    parts.forEach(part => {
        if (!part) return;
        current += (current ? '/' : '') + part;
        html += `<span data-path="${current}">${part}</span>`;
    });

    serverBreadcrumbs.innerHTML = html;
}

window.openReplaceModal = function (path, name) {
    document.getElementById('modal-filename').textContent = name;
    const input = document.getElementById('replace-input');
    input.value = '';
    input.dataset.targetPath = path;

    document.getElementById('replace-modal').classList.remove('hidden');
};

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
