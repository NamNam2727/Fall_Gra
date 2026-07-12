// =====================================
// minigame_sync.js
// ミニゲームの通信・同期管理（3分割の1/3）
// ★スコアを受信した際に通信エラーフラグ(isError)を解除する処理を追加
// ★途中入室時の状態同期にtargetEndTimeを追加し、PLAYING時の再現とログ表示を実装
// =====================================

window.MinigameManager = window.MinigameManager || {};

Object.assign(window.MinigameManager, {
    state: 'IDLE', // IDLE, PROPOSING, COUNTDOWN, PLAYING, RESULT
    currentProposal: null,
    myVote: null,
    
    proposeEndTime: 0,
    targetStartTime: 0, 
    targetEndTime: 0,
    earliestReadyTime: Infinity,
    
    currentPlugin: null,
    resultData: [],

    handleNetworkMessage: function(msg) {
        if (msg.type === 'mg_propose') {
            if (typeof this.receiveProposal === 'function') this.receiveProposal(msg.proposal);
        } else if (msg.type === 'mg_vote') {
            if (this.currentProposal && this.currentProposal.votes) {
                this.currentProposal.votes[String(msg.userId)] = msg.vote;
                if (typeof this.checkProposingStatus === 'function') this.checkProposingStatus();
            }
        } else if (msg.type === 'mg_cancel') {
            if (typeof this.cancelProposal === 'function') this.cancelProposal(msg.reason);
        } else if (msg.type === 'mg_ready') {
            if (typeof this.receiveReady === 'function') this.receiveReady(msg.timestamp);
        } else if (msg.type === 'mg_sync_state') {
            // ★引数に msg.targetEndTime を追加
            if (typeof this.syncState === 'function') this.syncState(msg.state, msg.targetStartTime, msg.proposal, msg.votes, msg.targetEndTime);
        } else if (msg.type === 'mg_plugin_sync') {
            if (this.currentPlugin && typeof this.currentPlugin.handleNetwork === 'function') {
                this.currentPlugin.handleNetwork(msg.data);
            }
        } else if (msg.type === 'mg_update_score') {
            const data = this.resultData.find(d => String(d.id) === String(msg.userId));
            if (data) {
                if (msg.isRetired && !data.isRetired && typeof window.addLog === 'function') {
                    window.addLog(`<span style="color:#ff3300;">${data.name} がリタイアしました。</span>`, 'sys');
                }
                data.scoreValue = msg.scoreValue;
                data.scoreText = msg.scoreText;
                data.statusText = msg.statusText; 
                data.isRetired = msg.isRetired;
                data.isError = false; 

                if (this.state === 'RESULT' || (document.getElementById('mg-result-window') && document.getElementById('mg-result-window').style.display === 'flex')) {
                    if (window.MinigameUI && typeof window.MinigameUI.showResult === 'function') {
                        const gameName = document.getElementById('result-game-name') ? document.getElementById('result-game-name').innerText : "ミニゲーム";
                        window.MinigameUI.showResult(gameName, this.resultData);
                    }
                }
            }
        } else if (msg.type === 'mg_request_score') {
            if (typeof this.replyMyScore === 'function') this.replyMyScore();
        } else if (msg.type === 'mg_reply_score') {
            const data = this.resultData.find(d => String(d.id) === String(msg.userId));
            if (data) {
                data.currentScoreText = msg.currentScoreText;
                data.currentScoreValue = msg.currentScoreValue;
                data.currentStatusText = msg.currentStatusText;
                
                if (!data.isRetired) {
                    const statusEl = document.getElementById('member-score-' + msg.userId);
                    if (statusEl) {
                        statusEl.innerText = msg.currentScoreText;
                        statusEl.style.color = '#ffaa00';
                    }
                }
            }
        }
    },

    syncState: function(remoteState, targetStartTime, proposal, remoteVotes, targetEndTime) {
        if (this.state !== 'IDLE' && this.state !== 'PROPOSING') return;

        this.currentProposal = proposal;
        if (remoteVotes && this.currentProposal) this.currentProposal.votes = remoteVotes;

        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');

        if (remoteState === 'PROPOSING') {
            this.state = 'PROPOSING';
            this.proposeEndTime = proposal.timestamp + 60000;
            
            const mgBtn = document.getElementById('minigame-btn');
            if (mgBtn) {
                mgBtn.innerText = 'ゲーム詳細';
                mgBtn.classList.add('detail-mode');
            }
            
            if (this.currentProposal.votes && this.currentProposal.votes[myId] === undefined) {
                this.myVote = null;
                if (typeof this.showProposalPopup === 'function') this.showProposalPopup();
            }
            if (typeof this.startProposingTimer === 'function') this.startProposingTimer();

        } else if (remoteState === 'COUNTDOWN' || remoteState === 'PLAYING') {
            this.state = remoteState;
            this.myVote = false; 
            
            // ★追加: 途中入室時の時刻同期と再計算
            if (targetStartTime) this.targetStartTime = targetStartTime;
            if (proposal && proposal.settings && proposal.settings.time) {
                const timeLimitSec = parseInt(proposal.settings.time, 10) * 60;
                this.targetEndTime = this.targetStartTime + (timeLimitSec * 1000);
            } else if (targetEndTime) {
                this.targetEndTime = targetEndTime;
            }

            if (typeof this.closeAllViews === 'function') this.closeAllViews();
            if (typeof this.enterSpectatorMode === 'function') this.enterSpectatorMode();
            if (typeof this.loadPlugin === 'function') this.loadPlugin();

            if (remoteState === 'COUNTDOWN' && targetStartTime) {
                if (typeof this.startCountdown === 'function') this.startCountdown(targetStartTime); 
            } else if (remoteState === 'PLAYING') {
                const mgBtn = document.getElementById('minigame-btn');
                if (mgBtn) {
                    mgBtn.innerText = '観戦モード';
                    mgBtn.classList.add('spectator-mode');
                }
                
                // ★追加: 途中入室時のログ表示
                if (typeof window.addLog === 'function') {
                    window.addLog('<span style="color:#ffaa00; font-weight:bold;">現在ミニゲームが進行しているため、終了まで観戦モードでお待ちください。</span>', 'sys');
                }
                
                // ★追加: スコア受信のために参加者リスト(resultData)を復元する
                this.resultData = [];
                let allUsers = [];
                
                if (window.GameState && window.GameState.userInfo) {
                    allUsers.push({
                        user_id: window.GameState.userInfo.user_id,
                        name: window.GameState.userInfo.name || window.GameState.userInfo.user_name || "Player",
                        portrait: window.GameState.userInfo.portrait || window.GameState.userInfo.portait || ""
                    });
                } else {
                    allUsers.push({ user_id: 'local', name: 'Player', portrait: '' });
                }

                if (window.MultiplayerManager && window.MultiplayerManager.otherPlayers) {
                    for (let id in window.MultiplayerManager.otherPlayers) {
                        let op = window.MultiplayerManager.otherPlayers[id];
                        allUsers.push({
                            user_id: op.id,
                            name: op.name || "Player",
                            portrait: op.icon || ""
                        });
                    }
                }

                allUsers.forEach(u => {
                    let isParticipating = false;
                    const uidStr = String(u.user_id);
                    if (this.currentProposal && this.currentProposal.votes && this.currentProposal.votes[uidStr] === true) {
                        isParticipating = true;
                    }
                    if (isParticipating) {
                        this.resultData.push({
                            id: uidStr,
                            name: u.name,
                            icon: u.portrait,
                            scoreText: "", 
                            scoreValue: null, 
                            statusText: "", 
                            isRetired: false,
                            isError: false,
                            rank: 0,
                            currentScoreText: "計算中...",
                            currentScoreValue: 0,
                            currentStatusText: ""
                        });
                    }
                });

                const timerUI = document.getElementById('mg-timer-ui');
                if (timerUI) timerUI.style.display = 'block';
            }
        }
    },

    sendMyVote: function(isJoin) {
        const myId = String((window.GameState && window.GameState.userInfo) ? window.GameState.userInfo.user_id : 'local');
        this.myVote = isJoin;
        if (this.currentProposal && this.currentProposal.votes) {
            this.currentProposal.votes[myId] = isJoin;
        }
        
        if (window.MultiplayerManager) {
            window.MultiplayerManager.sendData({ type: 'mg_vote', userId: myId, vote: isJoin });
        }
        if (typeof this.checkProposingStatus === 'function') this.checkProposingStatus();
    },

    receiveReady: function(timestamp) {
        if (this.state === 'IDLE' || this.state === 'RESULT') return; 
        
        if (timestamp < this.earliestReadyTime) {
            this.earliestReadyTime = timestamp;
            if (this.state === 'COUNTDOWN') {
                if (typeof this.calcTargetTimes === 'function') this.calcTargetTimes();
            }
        }
    },

    calcTargetTimes: function() {
        this.targetStartTime = this.earliestReadyTime + 10000;
        
        if (this.currentProposal && this.currentProposal.settings && this.currentProposal.settings.time) {
            const timeLimitSec = parseInt(this.currentProposal.settings.time, 10) * 60;
            this.targetEndTime = this.targetStartTime + (timeLimitSec * 1000);
        }
    }
});


