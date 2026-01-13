<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Universal Page Updater</title>
    <link rel="stylesheet" href="style.css">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>

    <div class="background-blobs">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
    </div>

    <div class="app-container">
        <header>
            <h1>Universal Page Updater</h1>
            <nav>
                <button class="nav-btn active" data-tab="sync">Sync Website</button>
                <button class="nav-btn" data-tab="manager">Server Manager</button>
            </nav>
        </header>

        <main>
            <!-- SECTION 1: SYNC -->
            <section id="sync-section" class="active-section">
                <div class="glass-card">
                    <div class="card-header">
                        <h2>Local to Server Sync</h2>
                        <p>Select your local website project folder to scan and update the server.</p>
                    </div>
                    
                    <!-- Drag & Drop Zone -->
                    <div class="drag-drop-card">
                        <div class="drag-drop-header">
                            <div class="folder-3d-icon">
                                <!-- Simple CSS folder or SVG -->
                                <div class="folder-back"></div>
                                <div class="folder-paper"></div>
                                <div class="folder-front"></div>
                            </div>
                            <div class="header-text">
                                <h3>Upload Project</h3>
                                <p>Select your website folder to sync</p>
                            </div>
                        </div>

                        <div class="drop-zone" id="drop-zone">
                            <div class="icon-upload">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="upload-icon-svg">
                                    <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M3 15V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                            <p class="drop-text">Drag & drop your project folder here</p>
                            <p class="drop-subtext">Supports HTML, PHP, Assets folders</p>
                            
                            <label for="folder-input" class="btn-browse">
                                Browse Folder
                                <input type="file" id="folder-input" webkitdirectory directory multiple>
                            </label>
                        </div>
                    </div>

                    <!-- Actions (Hidden initially) -->
                    <div class="actions-bar hidden" id="action-bar">
                        <span id="stats-info">Ready to scan...</span>
                        <div class="btn-group">
                            <button id="btn-compare" class="action-btn">Compare Files</button>
                            <button id="btn-upload" class="action-btn primary" disabled>Update Server</button>
                        </div>
                    </div>
                    
                    <div id="chart-section" class="hidden">
                        <div class="chart-header-title">
                            <h3>File Analysis</h3>
                            <p>Overview of changes to be deployed</p>
                        </div>
                        <div id="chart-container" class="chart-wrapper glass-panel">
                            <div class="chart-box">
                                <canvas id="statusChart"></canvas>
                            </div>
                            <div class="chart-legend" id="chart-legend">
                                <!-- Injected by JS -->
                            </div>
                        </div>
                    </div>
                </div>

                <div class="file-list-container glass-panel hidden" id="sync-results">
                    <div class="table-header">
                        <div class="col-check"><input type="checkbox" id="check-all"></div>
                        <div class="col-name">File Name</div>
                        <div class="col-status">Status</div>
                        <div class="col-size">Size (Local)</div>
                    </div>
                    <div class="table-body" id="sync-table-body">
                        <!-- Rows injected by JS -->
                    </div>
                </div>
            </section>

            <!-- SECTION 2: MANAGER -->
            <section id="manager-section">
                <div class="glass-card">
                    <div class="card-header">
                        <h2>Server File Manager</h2>
                        <div class="breadcrumbs" id="server-breadcrumbs">
                            <span data-path="">Root</span>
                        </div>
                    </div>
                    
                    <div class="file-list-container glass-panel">
                        <div class="table-header">
                            <div class="col-icon">Type</div>
                            <div class="col-name">Name</div>
                            <div class="col-size">Size</div>
                            <div class="col-action">Action</div>
                        </div>
                        <div class="table-body" id="manager-table-body">
                            <!-- Rows injected by JS -->
                        </div>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <!-- Modal for Single File Replace -->
    <div id="replace-modal" class="modal hidden">
        <div class="modal-content glass-card">
            <h3>Replace File</h3>
            <p>Upload a new version for: <strong id="modal-filename"></strong></p>
            <input type="file" id="replace-input">
            <div class="modal-actions">
                <button id="btn-cancel-replace" class="action-btn">Cancel</button>
                <button id="btn-confirm-replace" class="action-btn primary">Upload & Replace</button>
            </div>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
