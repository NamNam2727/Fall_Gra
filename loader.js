// =====================================
// loader.js
// ゲームに必要な全JSファイルを順番に読み込み、初期化する
// ★ minigame_manager を3つ(sync, flow, core)に分割して読み込むよう修正
// ★ 読み込み中にプログレスバー(ローディングUI)を表示する機能を追加
// =====================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // 読み込むスクリプトのリスト
    const coreScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'globals.js',
        'ui.js',
        'chat_system.js',
        'minigame_list.js',
        'minigame_sync.js',     // ★ 1/3
        'minigame_flow.js',     // ★ 2/3
        'minigame_core.js',     // ★ 3/3
        'minigame_ui.js',
        'how_to_play.js',       // ★追加: あそびかたUI
        'mapGenerator.js',
        'map.js',
        'player.js',
        'input.js',
        'item_system.js',
        'item_effects.js',
        'multiplayer.js',
        'main.js'
    ];

    let loadedCount = 0;

    // ==========================================
    // ローディングUIの作成と表示
    // ==========================================
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'game-loading-screen';
    // 背景を画像に変更
    loadingScreen.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background: url('https://namnam2727.github.io/Fall_Gra/title.PNG') center/cover no-repeat; z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; transition: opacity 0.5s ease;";
    
    const title = document.createElement('h1');
    title.innerText = "Loading Game...";
    title.style.cssText = 'font-size:32px; margin-bottom:20px; color:#ffaa00; text-shadow:0 0 10px rgba(255,170,0,0.8); margin-top:0;';
    
    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'width:80%; max-width:350px; height:12px; background:#333; border-radius:6px; overflow:hidden; margin-bottom:15px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.8); border: 2px solid #555;';
    
    const barFill = document.createElement('div');
    barFill.style.cssText = 'width:0%; height:100%; background:linear-gradient(90deg, #ffaa00, #ffea00); transition: width 0.1s ease-out;';
    
    const progressText = document.createElement('div');
    progressText.style.cssText = 'font-size:15px; color:#ddd; font-weight:bold; font-family: monospace; text-shadow: 1px 1px 2px black;'; // 文字が見えやすいように影を追加
    progressText.innerText = `0 / ${coreScripts.length} scripts loaded`;

    barContainer.appendChild(barFill);
    loadingScreen.appendChild(title);
    loadingScreen.appendChild(barContainer);
    loadingScreen.appendChild(progressText);
    document.body.appendChild(loadingScreen);

    // ==========================================
    // スクリプトの読み込み処理
    // ==========================================
    window.loadGameScript = function(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        if (src.startsWith('http')) {
            script.src = src;
        } else {
            // キャッシュ対策でタイムスタンプを付与
            script.src = baseURL + src + '?v=' + new Date().getTime(); 
        }
        
        script.onload = () => {
            console.log(`Loaded: ${src}`);
            if (typeof callback === 'function') callback();
        };
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
            if (typeof callback === 'function') callback();
        };
        document.head.appendChild(script);
    };

    function loadNext() {
        if (loadedCount < coreScripts.length) {
            window.loadGameScript(coreScripts[loadedCount], () => {
                loadedCount++;
                
                // UIのプログレスバーを更新
                const percentage = Math.floor((loadedCount / coreScripts.length) * 100);
                barFill.style.width = percentage + '%';
                progressText.innerText = `${loadedCount} / ${coreScripts.length} scripts loaded`;

                loadNext();
            });
        } else {
            console.log('All core scripts loaded. Initializing game...');
            // 少しだけ待ってから（プログレスバーが100%になるのを見せてから）起動
            setTimeout(startGame, 300);
        }
    }

    function startGame() {
        try {
            if (typeof window.animate !== 'function' && typeof animate !== 'function') {
                const errMsg = 'Error: main.js の初期化関数(animate)が見つかりません。';
                console.error(errMsg);
                document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:10px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;">${errMsg}</div>`;
                return;
            }

            // 各種初期化関数の呼び出し
            if (typeof window.initUI === 'function') window.initUI();
            else if (typeof initUI === 'function') initUI();
            
            if (typeof window.initChatSystem === 'function') window.initChatSystem();
            else if (typeof initChatSystem === 'function') initChatSystem();
            
            if (typeof window.initThreeJS === 'function') window.initThreeJS();
            else if (typeof initThreeJS === 'function') initThreeJS();
            
            if (typeof window.setupInputs === 'function') window.setupInputs();
            else if (typeof setupInputs === 'function') setupInputs();

            // アニメーションループの開始
            const animFunc = typeof window.animate === 'function' ? window.animate : animate;
            requestAnimationFrame(animFunc);
            
            // 全ての起動処理が成功したら、ローディング画面をフェードアウトして消す
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
            }, 500);
            
        } catch (e) {
            document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:60px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;">起動エラー: ${e.message}</div>`;
            console.error(e);
        }
    }

    // 読み込み開始
    loadNext();
})();

