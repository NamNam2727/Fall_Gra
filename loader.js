// =========================================================
// loader.js
// 外部JSファイルを順番に読み込み、ゲームを初期化・起動する
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // 依存関係を考慮したファイルの読み込み順序
    const scriptsToLoad = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', // 外部ライブラリ
        'js/globals.js',
        'js/ui.js',
        'js/map.js',
        'js/player.js',
        'js/input.js',
        'js/main.js'
    ];

    let loadedCount = 0;

    function loadScript(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        // 'http' から始まる外部URLの場合はそのまま、そうでない場合はbaseURLとキャッシュ回避パラメータを付与
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
        // 必須関数が読み込まれているかチェック
        if (typeof window.animate !== 'function') {
            console.error('Game initialization functions are missing.');
            return;
        }

        // UI関連の初期化を実行
        if (typeof window.initUI === 'function') window.initUI();
        
        // ゲームシステムの初期化を実行
        if (typeof window.initThreeJS === 'function') window.initThreeJS();
        if (typeof window.setupInputs === 'function') window.setupInputs();

        // メインループの開始
        requestAnimationFrame(window.animate);
    }

    // 読み込み開始
    loadNext();
})();
