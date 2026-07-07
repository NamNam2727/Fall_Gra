// =====================================
// main.js
// 水平Raycasterを用いた正確な壁・坂道判定と姿勢制御
// ★フライ(連続ジャンプ)中の天井衝突判定を追加
// ★観戦モードのドローン操作（重力無視）を追加
// ★押し出し処理を安定版の構造に戻し、すり抜けを完全解決
// ★カメラ操作: 旧バージョンの計算式を完全復元し、限界値を超えた時のみ貫通ズームを発動
// ★オートカメラ: 8点レイキャストを導入。キャラクター全体を捉え、不要なズームを防止。
// ★スライダー(0〜100)の挙動を修正: 10〜100は通常、0〜10を限界突破ズーム領域に設定
// =====================================

let mapMesh;
let raycaster = new THREE.Raycaster();
let downVector = new THREE.Vector3(0, -1, 0);

let currentFacingAngle = 0; 

function getTerrainMeshes() {
    let meshes = [];
    if (typeof scene === 'undefined') return meshes;
    scene.children.forEach(c => {
        if (c.visible) {
            if (c.userData && c.userData.isTerrain) {
                meshes.push(c);
            } else if (c.isGroup) {
                c.children.forEach(child => {
                    if (child.visible && child.userData && child.userData.isTerrain) {
                        meshes.push(child);
                    }
                });
            }
        }
    });
    return meshes;
}

window.initThreeJS = function() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 150);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 60, 30);
    dirLight.castShadow = true;
    const d = 60;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.width = 1024; dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    if (window.MapGenerator && typeof window.MapGenerator.createMesh === 'function') {
        mapMesh = window.MapGenerator.createMesh();
        scene.add(mapMesh);
    } else {
        console.error("MapGeneratorが見つかりません。");
    }

    initPlayer();

    if (window.MultiplayerManager) {
        window.MultiplayerManager.initExistingPlayers();
        setTimeout(() => {
            window.MultiplayerManager.requestPositions();
            window.MultiplayerManager.forceSendPos(); 
        }, 1000);
    }

    window.addEventListener('keydown', (e) => {
        if (window.isSpectatorMode) {
            if (e.code === 'Space') window.specMoveUp = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window.specMoveDown = true;
        }
    });
    window.addEventListener('keyup', (e) => {
        if (window.isSpectatorMode) {
            if (e.code === 'Space') window.specMoveUp = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window.specMoveDown = false;
        }
    });

    updateCamera(true, 0.016);
    window.addEventListener('resize', onWindowResize);
};

window.onWindowResize = function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

window.animate = function() {
    requestAnimationFrame(window.animate);
    
    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, 0.05); 
    
    updatePlayer(delta);
    
    if (window.MultiplayerManager) {
        window.MultiplayerManager.update(delta);
    }

    if (window.MinigameManager && typeof window.MinigameManager.update === 'function') {
        window.MinigameManager.update(delta);
    }
    
    updateCamera(false, delta);
    renderer.render(scene, camera);
};

function getGroundInfo(terrainMeshes, playerPosition, pRadius, myStepHeight) {
    let currentGroundY = -100;
    let groundNormal = new THREE.Vector3(0, 1, 0);

    if (terrainMeshes.length > 0) {
        let rayHeight = 2.5; 
        let origin = new THREE.Vector3(playerPosition.x, playerPosition.y + rayHeight, playerPosition.z);
        raycaster.set(origin, downVector);
        let intersects = raycaster.intersectObjects(terrainMeshes, false);

        for (let i = 0; i < intersects.length; i++) {
            let hitNormal = intersects[i].face.normal.clone();
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[i].object.matrixWorld);
            hitNormal.applyMatrix3(normalMatrix).normalize();

            if (hitNormal.y > 0.3) {
                if (intersects[i].point.y <= playerPosition.y + myStepHeight + 1.5) {
                    currentGroundY = intersects[i].point.y;
                    groundNormal.copy(hitNormal);
                    break;
                }
            }
        }
    }

    return { currentGroundY, groundNormal };
}

window.updatePlayer = function(delta) {
    const rotationSpeed = 12; 
    let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
    let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
    
    if (player.chatTimer > 0) {
        player.chatTimer -= delta;
        if (player.chatTimer <= 0 && player.chatSprite) {
            player.remove(player.chatSprite);
            if (player.chatSprite.material.map) player.chatSprite.material.map.dispose();
            player.chatSprite.material.dispose();
            player.chatSprite = null;
        }
    }

    let terrainMeshes = getTerrainMeshes();

    let groundInfo = getGroundInfo(terrainMeshes, player.position, pRadius, myStepHeight);
    let currentGroundY = groundInfo.currentGroundY;
    let groundNormal = groundInfo.groundNormal;

    let mX = 0, mZ = 0;

    if (moveVector.lengthSq() > 0.01) {
        const camForwardX = -Math.sin(cameraAngle), camForwardZ = -Math.cos(cameraAngle);
        const camRightX = Math.cos(cameraAngle), camRightZ = -Math.sin(cameraAngle);

        const moveDirX = camRightX * moveVector.x + camForwardX * (-moveVector.y);
        const moveDirZ = camRightZ * moveVector.x + camForwardZ * (-moveVector.y);
        const moveDirection = new THREE.Vector2(moveDirX, moveDirZ).normalize();
        const inputLength = Math.min(moveVector.length(), 1.0);
        
        mX = moveDirection.x * (inputLength * moveSpeed) * delta;
        mZ = moveDirection.y * (inputLength * moveSpeed) * delta;

        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        currentFacingAngle = targetRotationY; 
        
        if (moveVector.y <= 0.2 && Math.abs(moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotationY + Math.PI;
            let diff = targetCameraAngle - cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            cameraAngle += diff * 3.0 * delta;
        }
    }

    let isFalling = (isJumping && player.position.y > currentGroundY + 3.0);

    if (window.MultiplayerManager && !isFalling && !window.isSpectatorMode) {
        const others = window.MultiplayerManager.otherPlayers;
        for (let id in others) {
            let other = others[id];
            if (other.mesh && other.hasReceivedFirstPos !== false && !other.isSpectator) {
                let dx = player.position.x - other.mesh.position.x;
                let dz = player.position.z - other.mesh.position.z;
                let dy = player.position.y - other.mesh.position.y;
                
                let distXZ = Math.hypot(dx, dz);
                let combinedRadius = pRadius * 1.8; 
                
                if (distXZ < combinedRadius && dy > -0.2 && dy < 0.8) {
                    if (distXZ === 0) { 
                        dx = (Math.random() - 0.5) * 0.1;
                        dz = (Math.random() - 0.5) * 0.1;
                        distXZ = Math.hypot(dx, dz);
                    }
                    
                    let overlap = combinedRadius - distXZ;
                    
                    if (Math.abs(dy) < 0.4) {
                        mX += (dx / distXZ) * overlap * 0.5;
                        mZ += (dz / distXZ) * overlap * 0.5;
                    } else if (dy >= 0.4) {
                        let slideForce = overlap * 0.15; 
                        mX += (dx / distXZ) * slideForce;
                        mZ += (dz / distXZ) * slideForce;
                    }
                }
            }
        }
    }

    const nextX = player.position.x + mX;
    const nextZ = player.position.z + mZ;
    let margin = pRadius * 0.8; 
    let wallCheckY = player.position.y + myStepHeight * 0.8; 
    let headCheckY = player.position.y + pRadius * 1.8; 

    let canMoveX = true;
    if (Math.abs(mX) > 0.001 && terrainMeshes.length > 0) {
        let dirX = new THREE.Vector3(Math.sign(mX), 0, 0);
        let checkOrigins = [
            new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
            new THREE.Vector3(player.position.x, headCheckY, player.position.z)
        ];

        for (let origin of checkOrigins) {
            raycaster.set(origin, dirX);
            let interX = raycaster.intersectObjects(terrainMeshes, false);
            if (interX.length > 0 && interX[0].distance < margin + Math.abs(mX)) {
                let normal = interX[0].face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(interX[0].object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                if (normal.y < 0.6) {
                    canMoveX = false;
                    break;
                }
            }
        }
    }
    if (canMoveX) player.position.x = nextX;

    let canMoveZ = true;
    if (Math.abs(mZ) > 0.001 && terrainMeshes.length > 0) {
        let dirZ = new THREE.Vector3(0, 0, Math.sign(mZ));
        let checkOrigins = [
            new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
            new THREE.Vector3(player.position.x, headCheckY, player.position.z)
        ];

        for (let origin of checkOrigins) {
            raycaster.set(origin, dirZ);
            let interZ = raycaster.intersectObjects(terrainMeshes, false);
            if (interZ.length > 0 && interZ[0].distance < margin + Math.abs(mZ)) {
                let normal = interZ[0].face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(interZ[0].object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                if (normal.y < 0.6) {
                    canMoveZ = false;
                    break;
                }
            }
        }
    }
    if (canMoveZ) player.position.z = nextZ;

    groundInfo = getGroundInfo(terrainMeshes, player.position, pRadius, myStepHeight);
    currentGroundY = groundInfo.currentGroundY;
    groundNormal = groundInfo.groundNormal;

    if (window.isSpectatorMode) {
        const flySpeed = 20.0;
        if (window.specMoveUp) player.position.y += flySpeed * delta;
        if (window.specMoveDown) player.position.y -= flySpeed * delta;
        
        if (player.position.y < -30) player.position.y = 20;

        verticalVelocity = 0; 
        isJumping = false; 
    } else {
        if (isJumping) {
            verticalVelocity += gravity * delta;
            
            if (verticalVelocity > 0 && terrainMeshes.length > 0) {
                let upRayOrigin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 1.5, player.position.z);
                let upRay = new THREE.Raycaster(upRayOrigin, new THREE.Vector3(0, 1, 0));
                let upHits = upRay.intersectObjects(terrainMeshes, false);
                
                if (upHits.length > 0 && upHits[0].distance < pRadius * 1.0) {
                    verticalVelocity = 0; 
                }
            }

            player.position.y += verticalVelocity * delta;
            
            if (verticalVelocity < 0 && player.position.y <= currentGroundY) {
                player.position.y = currentGroundY; 
                isJumping = false; 
                verticalVelocity = 0;
                
                if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
            }
        } else {
            const groundGap = player.position.y - currentGroundY;
            if (groundGap > 1.2 && verticalVelocity <= 0) { 
                isJumping = true; 
                verticalVelocity = 0; 
            } else {
                player.position.y += (currentGroundY - player.position.y) * 0.3;
            }
        }
        
        if (player.position.y < -30) {
            player.position.set(0, 20, 0); 
            isJumping = true; 
            verticalVelocity = 0;
            
            if (window.MinigameManager && window.MinigameManager.state === 'PLAYING') {
                if (!window.isSpectatorMode) {
                    window.MinigameManager.executeRetire();
                }
            }
        }
    }

    const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentFacingAngle);
    const effectiveNormal = (!isJumping && !window.isSpectatorMode) ? groundNormal : new THREE.Vector3(0, 1, 0);
    const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
    player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);
};

// ヘルパー関数: スライダー値(val)からカメラ位置を計算
// ★ val は 0.0〜1.0 の値 (スライダーの 0〜100 に対応)
function getCameraPosBySlider(val, cAngle) {
    let baseDist = typeof cameraDistance !== 'undefined' ? cameraDistance : 5;
    let baseHeight = typeof cameraHeight !== 'undefined' ? cameraHeight : 15;
    
    let final_h, final_d;

    if (val >= 0.1) {
        // 【通常領域 (0.1 〜 1.0)】: スライダーの10〜100に相当
        // 以前の計算式をそのまま適用する
        let diff = val - 0.5;
        let h = baseHeight + (diff * 35.0);
        let d = baseDist + (diff * 15.0);
        final_h = Math.max(h, 1.0);
        final_d = Math.max(d, 1.0);
    } else {
        // 【貫通ズーム領域 (0.0 〜 0.1未満)】: スライダーの0〜10未満に相当
        // val = 0.1 の時の高さと距離を基準(限界)とする
        let diff_limit = 0.1 - 0.5;
        let limit_h = baseHeight + (diff_limit * 35.0);
        let limit_d = baseDist + (diff_limit * 15.0);
        limit_h = Math.max(limit_h, 1.0);
        limit_d = Math.max(limit_d, 1.0);

        // 高さは limit_h を維持
        final_h = limit_h;
        // 距離は limit_d から 0.1（スレスレ）に向かって縮める
        // valが 0.1 の時に t=1.0、valが 0.0 の時に t=0.0
        let t = val / 0.1;
        final_d = 0.1 + t * (limit_d - 0.1);
    }

    return new THREE.Vector3(
        player.position.x + Math.sin(cAngle) * final_d,
        player.position.y + final_h,
        player.position.z + Math.cos(cAngle) * final_d
    );
}

window.updateCamera = function(instant, delta = 0.016) {
    let cAngle = typeof cameraAngle !== 'undefined' ? cameraAngle : 0;
    // window.cameraSliderValue は 0.0〜1.0 (ui.jsで設定される値)
    let sliderVal = typeof window.cameraSliderValue !== 'undefined' ? window.cameraSliderValue : 0.5;

    // ----- 自動カメラ制御 -----
    if (window.isCameraAuto && typeof player !== 'undefined') {
        let terrainMeshes = getTerrainMeshes();
        if (terrainMeshes.length > 0) {
            
            let playerCenter = player.position.clone();
            playerCenter.y += 1.0; 

            // ★ 8点マルチ・レイキャストのターゲット
            let innerSpread = 0.5; // キャラクター周辺（近め）
            let outerSpread = 1.5; // キャラクター外側（遠め）
            
            let rightDir = new THREE.Vector3(Math.cos(cAngle), 0, -Math.sin(cAngle));
            let upDir = new THREE.Vector3(0, 1, 0);

            // キャラクターが確実に見えているか判定する「内側の4点」
            let innerTargets = [
                playerCenter.clone().add(upDir.clone().multiplyScalar(innerSpread)), // 上
                playerCenter.clone().sub(upDir.clone().multiplyScalar(innerSpread)), // 下
                playerCenter.clone().add(rightDir.clone().multiplyScalar(innerSpread)), // 右
                playerCenter.clone().sub(rightDir.clone().multiplyScalar(innerSpread))  // 左
            ];

            // 画面端に壁が被っていないか判定する「外側の4点」
            let outerTargets = [
                playerCenter.clone().add(upDir.clone().multiplyScalar(outerSpread)), 
                playerCenter.clone().sub(upDir.clone().multiplyScalar(outerSpread)), 
                playerCenter.clone().add(rightDir.clone().multiplyScalar(outerSpread)), 
                playerCenter.clone().sub(rightDir.clone().multiplyScalar(outerSpread))  
            ];

            let targetSliderValue = 0.0; 

            // 事前スキャン: 0.5(遠い) から 0.0(近い) に向けて仮想的にカメラを動かす
            for (let testVal = 0.5; testVal >= 0.0; testVal -= 0.01) {
                let testCamPos = getCameraPosBySlider(testVal, cAngle);
                
                let innerBlockedCount = 0;
                let outerBlockedCount = 0;

                // 内側の4点をチェック
                for (let i = 0; i < innerTargets.length; i++) {
                    let dir = new THREE.Vector3().subVectors(innerTargets[i], testCamPos);
                    let dist = dir.length();
                    dir.normalize();
                    raycaster.set(testCamPos, dir);
                    let hits = raycaster.intersectObjects(terrainMeshes, false);
                    if (hits.length > 0 && hits[0].distance < dist - 0.2) {
                        innerBlockedCount++;
                    }
                }

                // 外側の4点をチェック
                for (let i = 0; i < outerTargets.length; i++) {
                    let dir = new THREE.Vector3().subVectors(outerTargets[i], testCamPos);
                    let dist = dir.length();
                    dir.normalize();
                    raycaster.set(testCamPos, dir);
                    let hits = raycaster.intersectObjects(terrainMeshes, false);
                    if (hits.length > 0 && hits[0].distance < dist - 0.2) {
                        outerBlockedCount++;
                    }
                }

                // 【判定ロジック】
                if (innerBlockedCount > 0) {
                    // 内側が遮られている = キャラクター本体が見えない！ -> ズームイン続行（次のスキャンへ）
                    continue; 
                } else if (outerBlockedCount > 0) {
                    // 内側は見えているが、外側が遮られている = 画面端に壁がある
                    // キャラクターは見えているので、これ以上ズームインする必要はない。
                    // むしろ少しズームアウトして様子を見たいので、目標値として採用しスキャン終了。
                    targetSliderValue = testVal;
                    break;
                } else {
                    // 全く遮られていない = 視界クリア！
                    // ここが最適な位置なので目標値として採用しスキャン終了。
                    targetSliderValue = testVal;
                    break;
                }
            }

            // 今のスライダー値を目標値に向けて滑らかに動かす
            let diff = targetSliderValue - sliderVal;
            if (diff < 0) {
                // キャラクターが見えない時のズームイン
                sliderVal -= 1.5 * delta; 
                if (sliderVal < targetSliderValue) sliderVal = targetSliderValue;
            } else if (diff > 0) {
                // 画面端の壁を避ける、または視界クリアな時のズームアウト
                sliderVal += 0.5 * delta; 
                if (sliderVal > targetSliderValue) sliderVal = targetSliderValue;
            }
            
            sliderVal = Math.max(0.0, Math.min(1.0, sliderVal));
            
            if (window.cameraSliderValue !== sliderVal) {
                window.cameraSliderValue = sliderVal;
                const sliderEl = document.getElementById('camera-slider');
                if (sliderEl) {
                    // ui.jsの min="0" max="100" に対応させるため * 100
                    sliderEl.value = window.cameraSliderValue * 100;
                }
            }
        }
    }
    // -------------------------

    // 最終的なカメラ位置を計算
    const finalCamPos = getCameraPosBySlider(sliderVal, cAngle);
    
    if (instant) camera.position.copy(finalCamPos);
    else camera.position.lerp(finalCamPos, 0.1);
    
    let lookTarget = player.position.clone();
    lookTarget.y += 1.0;
    camera.lookAt(lookTarget);
};
