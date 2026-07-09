// =====================================
// htp_minigame.js
// あそびかた：3. ミニゲーム (申請と受信・変更)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Minigame = {
    modeIdx: 0,
    modes: ['propose', 'receive'],

    // UI要素の参照
    mgBtn: null,
    mgList: null,
    mgItem: null,
    mgDetail: null,
    mgApply: null,
    mgPopup: null,
    btnJoin: null,
    btnDecline: null,
    finger: null,

    init: function(container, htpManager) {
        // --- デモ空間専用のCSS ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-sub-panel { display: none; flex-direction: column; flex: 1; }
            .htp-sub-panel.active { display: flex; }
        `;
        container.appendChild(style);

        // UIのDOM構造を生成
        container.innerHTML += `
            <div class="htp-demo-area" style="position: relative;">
                <div id="htp-demo-canvas-container"></div>
                
                <!-- ミニゲームボタン（右上） -->
                <div id="htp-demo-mg-btn" style="position: absolute; right: 10px; top: 10px; padding: 6px 12px; background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: white; font-weight: bold; font-family: sans-serif; font-size: 12px; z-index: 10; transition: background 0.2s, transform 0.1s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    ミニゲーム
                </div>
                
                <!-- リストウィンドウ (1ページ目) -->
                <div id="htp-demo-mg-list" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">ミニゲームを選択</div>
                    <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 5px;">
                        <div id="htp-demo-mg-item" style="background: rgba(255,255,255,0.15); border-radius: 4px; padding: 6px 10px; display: flex; align-items: center; color: white; font-size: 13px; font-weight: bold; transition: transform 0.1s, background 0.1s; border: 1px solid #555;">
                            <div style="font-size: 20px; margin-right: 10px;">🎮</div>
                            <div>崩壊サバイバル</div>
                        </div>
                    </div>
                </div>

                <!-- 詳細ウィンドウ (1ページ目) -->
                <div id="htp-demo-mg-detail" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">崩壊サバイバル</div>
                    <div style="flex: 1; padding: 8px; color: #ccc; font-size: 11px; line-height: 1.4;">
                        歩いた足場が崩壊していく中、落下せずに最後まで生き残れ！
                    </div>
                    <div style="padding: 8px;">
                        <!-- ★ 緑色に変更 -->
                        <div id="htp-demo-mg-apply" style="background: #4CAF50; color: white; padding: 8px; text-align: center; border-radius: 4px; font-weight: bold; font-size: 12px; transition: transform 0.1s;">この設定で申請する</div>
                    </div>
                </div>

                <!-- ポップアップウィンドウ (2ページ目) -->
                <div id="htp-demo-mg-popup" style="display:none; position: absolute; top: 15px; left: 10%; width: 80%; height: 160px; background: rgba(30, 20, 20, 0.95); border: 2px solid #ff4444; border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); padding: 10px; font-family: sans-serif; text-align: center; box-sizing: border-box;">
                    <div style="color: #ffaa00; font-size: 14px; font-weight: bold; margin-bottom: 5px;">🎮 ゲーム開始申請</div>
                    <div style="font-size: 16px; color: white; font-weight: bold; margin-bottom: 5px;">崩壊サバイバル</div>
                    <div style="font-size: 11px; color: #ccc; background: rgba(0,0,0,0.5); padding: 4px; border-radius: 4px; margin-bottom: 10px;">制限時間: 3分 | アイテム: 1個</div>
                    <div style="display: flex; gap: 8px; margin-top: auto;">
                        <button id="htp-demo-btn-join" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; color: white; background: #4CAF50; transition: transform 0.1s;">参加する</button>
                        <button id="htp-demo-btn-decline" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; color: white; background: #f44336; transition: transform 0.1s;">参加しない</button>
                    </div>
                </div>

                <!-- 指アイコン（スムーズに移動させるため transition を設定） -->
                <div class="htp-demo-finger" id="htp-demo-finger-ui" style="position: absolute; z-index: 30; font-size: 32px; transition: left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s; opacity: 0; pointer-events: none;">👆</div>
            </div>
            
            <!-- 1. 申請パネル -->
            <div id="htp-panel-propose" class="htp-sub-panel active">
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
                    <button class="htp-nav-btn" onclick="HTP_Minigame.changeMode(1)">参加の受付と変更 ▶</button>
                </div>
            </div>

            <!-- 2. 受信パネル -->
            <div id="htp-panel-receive" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">参加の受付と変更</div>
                    <div>
                        誰かがミニゲームを申請すると、画面にポップアップが表示されます。<br>
                        「参加する」「参加しない（観戦モード）」のどちらかを選んでください。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">選んだ後も、他ユーザーが選択を終えていない（受付時間中）であれば、右上の「ゲーム詳細」ボタンを押すことで、再度ポップアップを開いて参加状態を切り替えることが可能です。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Minigame.changeMode(-1)">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        // UI要素の参照を取得
        this.mgBtn = document.getElementById('htp-demo-mg-btn');
        this.mgList = document.getElementById('htp-demo-mg-list');
        this.mgItem = document.getElementById('htp-demo-mg-item');
        this.mgDetail = document.getElementById('htp-demo-mg-detail');
        this.mgApply = document.getElementById('htp-demo-mg-apply');
        this.mgPopup = document.getElementById('htp-demo-mg-popup');
        this.btnJoin = document.getElementById('htp-demo-btn-join');
        this.btnDecline = document.getElementById('htp-demo-btn-decline');
        this.finger = document.getElementById('htp-demo-finger-ui');

        this.switchMode(0, htpManager);
        htpManager.startDemo();
    },

    changeMode: function(dir) {
        let newIdx = this.modeIdx + dir;
        if (newIdx >= 0 && newIdx < this.modes.length) {
            this.switchMode(newIdx, window.HowToPlay);
        }
    },

    switchMode: function(idx, htpManager) {
        this.modeIdx = idx;
        const mode = this.modes[idx];

        document.querySelectorAll('.htp-sub-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`htp-panel-${mode}`).classList.add('active');

        // UIの初期化
        this.mgBtn.style.transform = 'scale(1)';
        this.mgBtn.innerText = 'ミニゲーム';
        this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
        this.mgList.style.display = 'none';
        this.mgDetail.style.display = 'none';
        this.mgPopup.style.display = 'none';
        this.mgItem.style.transform = 'scale(1)';
        this.mgApply.style.transform = 'scale(1)';
        this.btnJoin.style.transform = 'scale(1)';
        this.btnDecline.style.transform = 'scale(1)';
        this.finger.style.opacity = '0';
        
        // 3D空間の初期化 (常に正面を向かせておく)
        htpManager.demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        htpManager.demo.player.quaternion.copy(rotQuat);
        htpManager.demo.context.currentFacingAngle = targetAngle;
        
        htpManager.demo.context.cameraAngle = 0;
        htpManager.demo.context.cameraDistance = 10;
        htpManager.demo.context.cameraHeight = 6;
    },

    updateScenario: function(time, delta, demo) {
        // キャラクターとカメラは静止状態を維持
        demo.context.moveVector.set(0, 0);
        const targetAngle = Math.PI; 
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
        demo.player.quaternion.slerp(rotQuat, 6 * delta);
        demo.context.currentFacingAngle = targetAngle;
        
        demo.context.cameraAngle = 0;
        demo.context.cameraDistance = 10;
        demo.context.cameraHeight = 6;

        const mode = this.modes[this.modeIdx];
        if (mode === 'propose') this.updatePropose(time, delta, demo);
        else if (mode === 'receive') this.updateReceive(time, delta, demo);
    },

    // ------------------------------------------
    // シナリオ1：ミニゲームの申請
    // ------------------------------------------
    updatePropose: function(time, delta, demo) {
        const cycle = time % 6.0;

        if (cycle < 0.1) {
            this.mgBtn.style.transform = 'scale(1)';
            this.mgBtn.innerText = 'ミニゲーム';
            this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
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
            this.finger.style.opacity = '1';
            this.finger.style.top = '25px';
            this.finger.style.left = 'calc(100% - 60px)';
        }
        else if (cycle >= 1.0 && cycle < 1.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgBtn.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 1.2 && cycle < 2.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgBtn.style.transform = 'scale(1)';
            this.mgList.style.display = 'flex';
            
            this.finger.style.top = '75px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 2.0 && cycle < 2.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgItem.style.transform = 'scale(0.95)';
            this.mgItem.style.background = 'rgba(255,255,255,0.3)';
        }
        else if (cycle >= 2.2 && cycle < 3.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgItem.style.transform = 'scale(1)';
            this.mgList.style.display = 'none';
            this.mgDetail.style.display = 'flex';

            this.finger.style.top = '145px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 3.5 && cycle < 3.7) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgApply.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 3.7 && cycle < 4.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgApply.style.transform = 'scale(1)';
            this.mgDetail.style.display = 'none';
            this.finger.style.opacity = '0';
            
            // 申請後にボタンが「ゲーム詳細」に変わる演出
            this.mgBtn.innerText = 'ゲーム詳細';
            this.mgBtn.style.background = 'rgba(50, 150, 255, 0.9)';
        }
    },

    // ------------------------------------------
    // シナリオ2：参加の受付と変更
    // ------------------------------------------
    updateReceive: function(time, delta, demo) {
        const cycle = time % 8.0;

        if (cycle < 0.1) {
            this.mgBtn.style.transform = 'scale(1)';
            this.mgBtn.innerText = 'ミニゲーム';
            this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
            
            this.mgPopup.style.display = 'flex';
            this.btnJoin.style.transform = 'scale(1)';
            this.btnDecline.style.transform = 'scale(1)';

            this.finger.style.opacity = '0';
            this.finger.style.top = '180px'; 
            this.finger.style.left = '25%';  
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.2) {
            this.finger.style.opacity = '1';
            this.finger.style.top = '135px'; 
            this.finger.style.left = '25%'; // 参加するボタン上
        }
        else if (cycle >= 1.2 && cycle < 1.4) {
            this.finger.style.transform = 'scale(0.9)';
            this.btnJoin.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 1.4 && cycle < 2.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.btnJoin.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'none';
            
            // 選択後に「ゲーム詳細」ボタンへ変化
            this.mgBtn.innerText = 'ゲーム詳細';
            this.mgBtn.style.background = 'rgba(50, 150, 255, 0.9)';

            this.finger.style.top = '25px';
            this.finger.style.left = 'calc(100% - 60px)'; // 右上へ移動
        }
        else if (cycle >= 2.5 && cycle < 2.7) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgBtn.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 2.7 && cycle < 4.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgBtn.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'flex';

            this.finger.style.top = '135px';
            this.finger.style.left = '75%'; // 参加しないボタン上
        }
        else if (cycle >= 4.0 && cycle < 4.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.btnDecline.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 4.2 && cycle < 5.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.btnDecline.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'none';
            
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
        this.mgPopup = null;
        this.btnJoin = null;
        this.btnDecline = null;
        this.finger = null;
        
        // カメラのズーム設定を元に戻す
        htpManager.demo.context.cameraDistance = 8;
        htpManager.demo.context.cameraHeight = 5;
    }
};


