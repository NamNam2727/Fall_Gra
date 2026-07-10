// =====================================
// htp_about.js
// あそびかた：5. このゲームについて
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_About = {
    init: function(container, htpManager) {
        // 3Dデモ画面は使用しないため停止
        htpManager.stopDemo();

        const style = document.createElement('style');
        style.innerHTML = `
            .htp-about-wrapper {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 10px;
            }
            .profile-container {
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 30px 20px;
                gap: 20px;
                font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
                background-color: #f2f3f5;
                border-radius: 12px;
                width: 100%;
                box-sizing: border-box;
            }
            .user-info {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            .avatar-circle {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                object-fit: cover;
                background-color: #e0e0e0;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            .user-name {
                font-size: 20px;
                font-weight: bold;
                color: #303133;
            }
            .download {
                background: #000;
                border-radius: 60px;
                color: #fedaa3;
                font-size: 14px;
                font-weight: 500;
                height: 44px;
                line-height: 44px;
                text-align: center;
                width: 250px;
                text-decoration: none;
                display: inline-block;
                transition: opacity 0.2s;
            }
            .download:hover {
                opacity: 0.8;
            }
            .about-message {
                font-size: 14px;
                line-height: 1.6;
                text-align: center;
                font-weight: bold;
                color: #303133;
            }
        `;
        container.appendChild(style);

        container.innerHTML += `
            <div class="htp-about-wrapper">
                <div class="profile-container">
                    <div class="user-info">
                        <img src="https://cdn.gravity.place/virtual/portrait/online/20250606/07e8cf95-8762-414a-af4c-d2b5bf1be226.png" alt="なむぴょん" class="avatar-circle">
                        <span class="user-name">なむぴょん</span>
                    </div>
                    
                    <div class="about-message">
                        遊んでくれてありがとう。<br>
                        楽しかったら右上の[･･･]ボタンから<br>
                        ❤️いいねを押してね。<br>
                        不具合・ご意見・ご要望・感想等があれば、<br>
                        メッセージやコメントを送ってね。<br>
                        特に、感想をくれるとめちゃくちゃ喜ぶよ！
                    </div>

                    <a href="https://www.gravity.place/user/1539168218" class="download" id="openAppBtn">プロフィールを開く</a>
                </div>
            </div>
        `;

        // ユニバーサルリンクによるアプリ起動処理
        const openAppBtn = document.getElementById('openAppBtn');
        if (openAppBtn) {
            openAppBtn.addEventListener('click', function(event) {
                // ユニバーサルリンクによるアプリ起動処理
            });
        }
    },

    updateScenario: function(time, delta, demo) {
        // 何も処理しない
    },

    cleanup: function(htpManager) {
        // 何も処理しない
    }
};


