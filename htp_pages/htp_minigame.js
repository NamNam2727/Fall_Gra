// =====================================
// htp_minigame.js
// あそびかた：3. ミニゲーム (申請と開始方法)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Minigame = {
    // UI要素の参照
    mgBtn: null,
    mgList: null,
    mgItem: null,
    mgDetail: null,
    mgApply: null,
    finger: null,

    init: function(container, htpManager) {
        // UIのDOM構造を生成
        container.innerHTML = `
            <div class="htp-demo-area" style="position: relative;">
                <div id="htp-demo-canvas-container"></div>
                
                <!-- ミニゲームボタン（右上） -->
                <div id="htp-demo-mg-btn" style="position: absolute; right: 10px; top: 10px; padding: 6px 12px; background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: white; font-weight: bold; font-family: sans-serif; font-size: 12px; z-index: 10; transition: transform 0.1s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    ミニゲーム
                </div>
                
                <!-- リストウィンドウ -->
                <div id="htp-demo-mg-list" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">ミニゲームを選択</div>
                    <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 5px;">
                        <div id="htp-demo-mg-item" style="background: rgba(255,255,255,0.15); border-radius: 4px; padding: 6px 10px; display: flex; align-items: center; color: white; font-size: 13px; font-weight: bold; transition: transform 0.1s, background 0.1s; border: 1px solid #555;">
                            <div style="font-size: 20px; margin-right: 10px;">🎮</div>
                            <div>崩壊サバイバル</div>
                        </div>
                    </div>
                </div>

                <!-- 詳細ウィンドウ -->
                <div id="htp-demo-mg-detail" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">崩壊サバイバル</div>
                    <div style="flex: 1; padding: 8px; color: #ccc; font-size: 11px; line-height: 1.4;">
                        歩いた足場が崩壊していく中、落下せずに最後まで生き残れ！
                    </div>
                    <div style="padding: 8px;">
                        <div id="htp-demo-mg-apply" style="background: #e94560; color: white; padding: 8px; text-align: center; border-radius: 4px; font-weight: bold; font-size: 12px; transition: transform 0.1s;">この設定で申請する</div>
                    </div>
                </div>

                <!-- 指アイコン（スムーズに移動させるため left, top に transition を設定） -->
                <div class="htp-demo-finger" id="htp-demo-finger-ui" style="position: absolute; z-index: 30; font-size: 32px; transition: left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s; opacity: 0; pointer-events: none;">👆</div>
            </div>
            
            <div class="htp-sub-panel active">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">ミニゲームの申請</div>
                    <div>
                        画面右上の「ミニゲーム」ボタンを押すと、遊べるゲームのリストが表示されます。<br><br>
                        遊びたいゲームを選び、「この設定で申請する」ボタンを押すと、同じ部屋のみんなに募集が送られます。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">他ユーザーの参加が決まるか、他に参加者が存在する状態で60秒が経過したら、自動的にゲームを開始します。</span><br>
                        <span style="color:#ffaa00; font-size: 12px; font-weight:bold;">※ただし、プレイヤーが自分1人の場合は、シングルプレイとして直ちに開始することができます。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div> <!-- 左寄せ用ダミー -->
                    <button class="htp-nav-btn" onclick="alert('次回実装予定です')">観戦モードについて ▶</button>
                </div>
            </div>
        `;

        // UI要素の参照を取得
        this.mgBtn = document.getElementById('htp-demo-mg-btn');
        this.mgList = document.getElementById('htp-demo-mg-list');
        this.mgItem = document.getElementById('htp-demo-mg-item');
        this.mgDetail = document.getElementById('htp-demo-mg-detail');
        this.mgApply = document.getElementById('htp-demo-mg-apply');
        this.finger = document.getElementById('htp-demo-finger-ui');

        // デモ開始
        htpManager.startDemo();
    },

    updateScenario: function(time, delta, demo) {
        // キャラクターとカメラは静止状態を維持
        demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        demo.player.quaternion.slerp(rotQuat, 6 * delta);
        demo.context.currentFacingAngle = targetAngle;
        
        // 少しズームして背後から固定
        demo.context.cameraAngle = 0;
        demo.context.cameraDistance = 10;
        demo.context.cameraHeight = 6;

        // --- 申請フローのUIアニメーションシナリオ (6秒周期) ---
        const cycle = time % 6.0;

        if (cycle < 0.1) {
            // 初期状態リセット
            this.mgBtn.style.transform = 'scale(1)';
            this.mgList.style.display = 'none';
            this.mgDetail.style.display = 'none';
            this.mgItem.style.transform = 'scale(1)';
            this.mgItem.style.background = 'rgba(255,255,255,0.15)';
            this.mgApply.style.transform = 'scale(1)';
            
            this.finger.style.opacity = '0';
            this.finger.style.top = '100px';
            this.finger.style.left = '50%';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.0) {
            // 指が右上のミニゲームボタンへ移動
            this.finger.style.opacity = '1';
            this.finger.style.top = '25px';
            this.finger.style.left = 'calc(100% - 60px)';
        }
        else if (cycle >= 1.0 && cycle < 1.2) {
            // ミニゲームボタンをタップ
            this.finger.style.transform = 'scale(0.9)';
            this.mgBtn.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 1.2 && cycle < 2.0) {
            // リストが開き、指がゲームリストへ移動
            this.finger.style.transform = 'scale(1.1)';
            this.mgBtn.style.transform = 'scale(1)';
            this.mgList.style.display = 'flex';
            
            this.finger.style.top = '75px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 2.0 && cycle < 2.2) {
            // リストのゲームをタップ
            this.finger.style.transform = 'scale(0.9)';
            this.mgItem.style.transform = 'scale(0.95)';
            this.mgItem.style.background = 'rgba(255,255,255,0.3)';
        }
        else if (cycle >= 2.2 && cycle < 3.5) {
            // 詳細が開き、指が申請ボタンへ移動
            this.finger.style.transform = 'scale(1.1)';
            this.mgItem.style.transform = 'scale(1)';
            this.mgList.style.display = 'none';
            this.mgDetail.style.display = 'flex';

            this.finger.style.top = '145px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 3.5 && cycle < 3.7) {
            // 申請ボタンをタップ
            this.finger.style.transform = 'scale(0.9)';
            this.mgApply.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 3.7) {
            // ウィンドウが閉じ、指が消える
            this.finger.style.transform = 'scale(1.1)';
            this.mgApply.style.transform = 'scale(1)';
            this.mgDetail.style.display = 'none';
            this.finger.style.opacity = '0';
        }
    },

    cleanup: function(htpManager) {
        // UI参照の解放
        this.mgBtn = null;
        this.mgList = null;
        this.mgItem = null;
        this.mgDetail = null;
        this.mgApply = null;
        this.finger = null;
        
        // カメラのズーム設定を元に戻す
        htpManager.demo.context.cameraDistance = 8;
        htpManager.demo.context.cameraHeight = 5;
    }
};

