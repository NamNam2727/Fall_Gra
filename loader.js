// =========================================================
// loader.js
// 外部JSファイルを順番に読み込み、ゲームを初期化・起動する
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // ★変更: js/ サブフォルダを廃止し、すべてルートディレクトリから読み込む
    const coreScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'globals.js',
        'ui.js',
        'chat_system.js',
        'mapGenerator.js',
        'map.js',
        'player.js',
        'input.js',
        'item_system.js', // アイテムシステムをロードリストに追加
        'multiplayer.js',
        'main.js'
    ];

    let loadedCount = 0;

    window.loadGameScript = function(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        if (src.startsWith('http')) {
            script.src = src;
        } else {
            script.src = baseURL + src + '?v=' + new Date().getTime(); 
        }
        
        script.onload = () => {
            console.log(`Loaded: ${src}`);
            if (typeof callback === 'function') callback();
        };
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
        };
        document.head.appendChild(script);
    };

    function loadNext() {
        if (loadedCount < coreScripts.length) {
            window.loadGameScript(coreScripts[loadedCount], () => {
                loadedCount++;
                loadNext();
            });
        } else {
            console.log('All core scripts loaded. Initializing game...');
            startGame();
        }
    }

    function startGame() {
        if (typeof window.animate !== 'function') {
            console.error('Game initialization functions are missing.');
            return;
        }

        // 1. UIとチャットの初期化
        if (typeof window.initUI === 'function') window.initUI();
        if (typeof window.initChatSystem === 'function') window.initChatSystem();
        
        // 2. 3D空間とプレイヤーの初期化
        if (typeof window.initThreeJS === 'function') window.initThreeJS();
        if (typeof window.setupInputs === 'function') window.setupInputs();

        // ★修正: 3D空間が作られた "後" にアイテムシステムを初期化する
        if (window.ItemSystem && typeof window.ItemSystem.init === 'function') {
            window.ItemSystem.init();
        }

        // 3. メインループ開始
        requestAnimationFrame(window.animate);
    }

    // 読み込み開始
    loadNext();
})();
