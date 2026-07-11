// ==========================================
// gravity_router.js
// UIの生成から通信ロジックまでをすべて管理する外部モジュール
// ==========================================

(function initGravityRouter() {
    // 1. スタイルの動的生成
    const style = document.createElement('style');
    style.innerHTML = `
        :root {
            --bg-color: #1a1a2e;
            --panel-bg: #16213e;
            --primary-color: #e94560;
            --text-light: #ededed;
            --accent-color: #0f3460;
        }
        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-color);
            font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', sans-serif;
            color: var(--text-light);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #game-app {
            width: 100%;
            max-width: 400px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            overflow-y: auto;
            padding: 20px;
        }
        h1 {
            font-size: 20px;
            text-align: center;
            margin-bottom: 20px;
            color: #fff;
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 10px;
        }
        .test-section {
            background: var(--panel-bg);
            border: 2px solid var(--accent-color);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
        }
        .test-title {
            font-size: 13px;
            color: #a0a0a0;
            margin-bottom: 10px;
        }
        .btn {
            background-color: var(--primary-color);
            color: #fff;
            border: none;
            border-radius: 4px;
            padding: 12px;
            font-size: 14px;
            font-weight: bold;
            width: 100%;
            cursor: pointer;
            transition: transform 0.1s, opacity 0.2s, background-color 0.2s;
        }
        .btn:active {
            transform: scale(0.95);
            opacity: 0.8;
        }
        .btn:disabled {
            background-color: #555;
            color: #888;
            cursor: not-allowed;
        }
        textarea {
            width: 100%;
            height: 80px;
            padding: 10px;
            box-sizing: border-box;
            background-color: #0f172a;
            color: #fff;
            border: 1px solid #334155;
            border-radius: 4px;
            font-size: 14px;
            resize: none;
            outline: none;
            margin-bottom: 10px;
        }
        textarea:focus {
            border-color: var(--primary-color);
        }
    `;
    document.head.appendChild(style);

    // 2. UI要素（ボタンやテキスト欄）の動的生成
    const gameAppEl = document.getElementById('game-app');
    if (gameAppEl) {
        gameAppEl.innerHTML = `
            <h1>ルーター動作テスト</h1>

            <div class="test-section">
                <div class="test-title">プロフィール画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openProfile('1539168218')">なむぴょんのプロフィールを開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">惑星画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openStar('17638')">AIゲーム工房を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">投稿画面を開く機能</div>
                <button class="btn" onclick="GravityRouter.openFeed('9_41721838')">7/11 Fall Grasリリースの投稿を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">質問ひろばを開く機能</div>
                <button class="btn" onclick="GravityRouter.openQuestion('147853')">テスト用に投稿した質問を開く</button>
            </div>

            <div class="test-section">
                <div class="test-title">投稿に文字を引用する機能</div>
                <button class="btn" onclick="createPostTextOnly()">投稿に引用する</button>
            </div>

            <div class="test-section">
                <div class="test-title">投稿に文字と画像を引用する機能</div>
                
                <textarea id="post-text-input" placeholder="テキストを入力">テスト投稿です！
デバッグメニューからの画像付きシェアテストです。</textarea>

                <div id="capture-target" style="padding: 15px; background-color: #1e293b; border: 2px dashed #475569; border-radius: 6px; margin-bottom: 10px; text-align: center;">
                    <h3 style="color: #e94560; margin: 0 0 10px 0;">動作テスト</h3>
                    <p style="color: #ededed; margin: 0; font-size: 14px;">🌟 シェア機能のテスト中です 🌟</p>
                </div>

                <button class="btn" id="capture-btn" onclick="createPostWithImageCapture()">投稿画面を開く</button>
            </div>
        `;
        
        // レイアウト補正（GRAVITYヘッダー領域回避）
        const screenHeight = window.innerHeight;
        const topExclusionHeight = screenHeight >= 812 ? 98 : 74;
        gameAppEl.style.paddingTop = topExclusionHeight + 'px';
    }

    // 3. iOS専用 ネイティブルーティング処理モジュール
    window.GravityRouter = {
        _sendToApp: function(command, paramObj) {
            const encodedJson = encodeURIComponent(JSON.stringify(paramObj));
            const innerUrl = command + "?0=" + encodedJson;
            const deepLink = "slme://internal?type=5&ani=1&url=" + encodeURIComponent(innerUrl);

            try {
                window.top.location.href = deepLink;
            } catch (e) {
                let i = document.createElement('iframe');
                i.style.cssText = 'position:absolute;width:0;height:0;opacity:0';
                i.src = deepLink;
                document.body.appendChild(i);
                setTimeout(function() { i.remove(); }, 5000);
            }
        },
        openProfile: function(userId) {
            const paramObj = { uid: Number(userId), selectedIndex: 0, web_url: "https://www.gravity.place/user/" + userId, s: "web", b: "user" };
            this._sendToApp("usercenter", paramObj);
        },
        openStar: function(starId) {
            const paramObj = { starId: Number(starId), s: "web", b: "star", web_url: "https://www.gravity.place/star/" + starId };
            this._sendToApp("stardetail", paramObj);
        },
        openFeed: function(feedId) {
            const paramObj = { id: String(feedId), s: "web", b: "feed", web_url: "https://www.gravity.place/detail/" + feedId };
            this._sendToApp("feeddetail", paramObj);
        },
        openQuestion: function(questionId) {
            const paramObj = { qid: String(questionId), s: "web", b: "ask_feed", selectedIndex: 0, web_url: "https://www.gravity.place/ask-feed/" + questionId };
            this._sendToApp("hotquestiondetail", paramObj);
        },
        createPost: function(text) {
            const paramObj = { s: "web", b: "makefeed", text: String(text) };
            this._sendToApp("makefeed", paramObj);
        }
    };

    // 4. テキストのみの投稿作成機能
    window.createPostTextOnly = function() {
        const text = "このAIゲーム楽しいよ、是非遊んでみて\nhttps://www.gravity.place/share/ugcGame?id=43660";
        window.GravityRouter.createPost(text);
    };

    // 5. 画像付き投稿の処理（公式SDK使用版）
    window.createPostWithImageCapture = async function() {
        const captureArea = document.getElementById('capture-target');
        const textArea = document.getElementById('post-text-input');
        const textValue = textArea ? textArea.value : "";
        const btn = document.getElementById('capture-btn');
        
        if (!captureArea || !btn) return;

        const originalText = btn.innerText;
        btn.disabled = true;

        try {
            // ステップ1: 画像の撮影
            btn.innerText = "1/3 画像を撮影中...";
            const canvas = await window.html2canvas(captureArea, {
                scale: 2,
                backgroundColor: "#1e293b",
                useCORS: true,
                logging: false
            });
            const base64Image = canvas.toDataURL('image/png');
            
            // ステップ2: 公式SDKでアプリへ送信
            btn.innerText = "2/3 アプリへ送信中...";
            if (window.AgentSDK && window.AgentSDK.feed) {
                const result = await window.AgentSDK.feed.uploadFeed({
                    image: base64Image,
                    content: textValue
                });
                
                // ステップ3: 完了判定
                if (result && result.errno === 0) {
                    btn.innerText = "3/3 シェア完了 ✓";
                    btn.style.backgroundColor = "#4CAF50"; 
                } else {
                    btn.innerText = "エラー: " + (result ? result.errno : "不明");
                }
            } else {
                btn.innerText = "SDKが未ロードです";
            }
        } catch (err) {
            btn.innerText = "処理に失敗しました";
            console.error(err);
        } finally {
            // 4秒後にボタンの状態を元に戻す
            setTimeout(function() {
                btn.innerText = originalText;
                btn.disabled = false;
                btn.style.backgroundColor = "var(--primary-color)";
            }, 4000);
        }
    };
})();
