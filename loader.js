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
        'item_system.js', // ★追加: アイテムシステムをロードリストに追加
        'multiplayer.js',
        'main.js'
    ];

    let loadedCount = 0;

    // ★追加・変更: スクリプトを読み込む関数をグローバルに公開する
    // 今後、UIボタンを押した際に window.loadGameScript('minigame/gameA.js', callback) 
    // のように呼び出すことで、後からミニゲームを動的に追加・実行できるようになります。
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

        if (typeof window.initUI === 'function') window.initUI();
        if (typeof window.initChatSystem === 'function') window.initChatSystem();
        
        if (typeof window.initThreeJS === 'function') window.initThreeJS();
        if (typeof window.setupInputs === 'function') window.setupInputs();

        requestAnimationFrame(window.animate);
    }

    // 読み込み開始
    loadNext();
})();
