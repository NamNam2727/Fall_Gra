// =========================================================
// loader.js
// 外部JSファイルを順番に読み込み、ゲームを初期化・起動する
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    const scriptsToLoad = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'js/globals.js',
        'js/ui.js',
        'js/chat_system.js', // ★追加: チャットシステム
        'js/map.js',
        'js/player.js',
        'js/input.js',
        'js/multiplayer.js',
        'js/main.js'
    ];

    let loadedCount = 0;

    function loadScript(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        if (src.startsWith('http')) {
            script.src = src;
        } else {
            script.src = baseURL + src + '?v=' + new Date().getTime(); 
        }
        
        script.onload = () => {
            console.log(`Loaded: ${src}`);
            callback();
        };
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
        };
        document.head.appendChild(script);
    }

    function loadNext() {
        if (loadedCount < scriptsToLoad.length) {
            loadScript(scriptsToLoad[loadedCount], () => {
                loadedCount++;
                loadNext();
            });
        } else {
            console.log('All scripts loaded. Initializing game...');
            startGame();
        }
    }

    function startGame() {
        if (typeof window.animate !== 'function') {
            console.error('Game initialization functions are missing.');
            return;
        }

        if (typeof window.initUI === 'function') window.initUI();
        if (typeof window.initChatSystem === 'function') window.initChatSystem(); // ★追加
        
        if (typeof window.initThreeJS === 'function') window.initThreeJS();
        if (typeof window.setupInputs === 'function') window.setupInputs();

        requestAnimationFrame(window.animate);
    }

    loadNext();
})();
