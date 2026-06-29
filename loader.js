// =========================================================
// loader.js
// 外部JSファイルを順番に読み込み、ゲームを初期化・起動する
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // ★js/ サブフォルダを廃止し、すべてルートディレクトリから読み込む（オリジナル通り）
    const coreScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'globals.js',
        'ui.js',
        'chat_system.js',
        'mapGenerator.js',
        'map.js',
        'player.js',
        'input.js',
        'item_system.js', // アイテムシステムを追加
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
            // エラーで止まらずに強引に次を読み込む
            if (typeof callback === 'function') callback();
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
        // ★青い画面のまま止まる原因を特定するためのデバッグ機能を搭載
        try {
            // 関数が認識されているかチェック
            if (typeof window.animate !== 'function' && typeof animate !== 'function') {
                const errMsg = 'Error: main.js の初期化関数(animate)が見つかりません。ファイル内に構文エラーがある可能性があります。';
                console.error(errMsg);
                document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:10px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px; pointer-events:auto;">${errMsg}</div>`;
                return;
            }

            if (typeof window.initUI === 'function') window.initUI();
            else if (typeof initUI === 'function') initUI();
            
            if (typeof window.initChatSystem === 'function') window.initChatSystem();
            else if (typeof initChatSystem === 'function') initChatSystem();
            
            if (typeof window.initThreeJS === 'function') window.initThreeJS();
            else if (typeof initThreeJS === 'function') initThreeJS();
            
            if (typeof window.setupInputs === 'function') window.setupInputs();
            else if (typeof setupInputs === 'function') setupInputs();

            // 確実に関数を取得してループ開始
            const animFunc = typeof window.animate === 'function' ? window.animate : animate;
            requestAnimationFrame(animFunc);
            
        } catch (e) {
            // 例外エラーが発生した場合も画面に表示する
            document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:60px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px; pointer-events:auto;">起動エラー: ${e.message}</div>`;
            console.error(e);
        }
    }

    // 読み込み開始
    loadNext();
})();
