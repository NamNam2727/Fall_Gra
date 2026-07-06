// =====================================
// main.js
// 水平Raycasterを用いた正確な壁・坂道判定と姿勢制御
// ★フライ(連続ジャンプ)中の天井衝突判定を追加
// ★観戦モードのドローン操作（重力無視）を追加
// ★押し出し処理を安定版の構造に戻し、すり抜けを完全解決
// ★カメラ操作: スライダー(0.0〜1.0)の解釈を分割し、0〜0.25を限界突破の貫通ズームに割り当て
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


// ★スライダーの値(0.0〜1.0)からカメラ位置を計算するヘルパー関数
function getCameraPosBySlider(val, cAngle) {
    let baseDist = typeof cameraDistance !== 'undefined' ? cameraDistance : 5;
    let baseHeight = typeof cameraHeight !== 'undefined' ? cameraHeight : 15;
    
    let h, d;

    if (val >= 0.5) {
        // 【上半分 (0.5〜1.0)】: 以前と全く同じ計算式 (デフォルト位置〜見下ろし)
        let diff = val - 0.5;
        h = baseHeight + (diff * 35.0);
        d = baseDist + (diff * 15.0);
        h = Math.max(h, 1.0);
        d = Math.max(d, 1.0);
    } else if (val >= 0.25) {
        // 【下半分・通常 (0.25〜0.5)】: 以前の 0.0〜0.5(接近) に相当する動きを引き伸ばして適用
        let diff = (val - 0.5) * 2.0; 
        h = baseHeight + (diff * 35.0);
        d = baseDist + (diff * 15.0);
        h = Math.max(h, 1.0);
        d = Math.max(d, 1.0);
    } else {
        // 【限界突破領域 (0.0〜0.25)】: 高さを維持したままキャラクターに向かって貫通ズーム
        let minDiff = -0.5; // 旧0.0の時のdiff
        let minHeight = baseHeight + (minDiff * 35.0);
        let minDist = baseDist + (minDiff * 15.0);
        minHeight = Math.max(minHeight, 1.0);
        minDist = Math.max(minDist, 1.0); // 通常限界の距離 (1.0)

        h = minHeight; // 高さは固定
        let t = val / 0.25; // 0.0(超接近) 〜 1.0(通常限界)
        d = 0.1 + (t * (minDist - 0.1)); // 距離を 0.1(目の前) から minDist の間でスライド
    }

    return new THREE.Vector3(
        player.position.x + Math.sin(cAngle) * d,
        player.position.y + h,
        player.position.z + Math.cos(cAngle) * d
    );
}


window.updateCamera = function(instant, delta = 0.016) {
    let cAngle = typeof cameraAngle !== 'undefined' ? cameraAngle : 0;
    
    let sliderVal = typeof window.cameraSliderValue !== 'undefined' ? window.cameraSliderValue : 0.5;

    // ----- 自動カメラ制御 -----
    if (window.isCameraAuto && typeof player !== 'undefined') {
        let terrainMeshes = getTerrainMeshes();
        if (terrainMeshes.length > 0) {
            
            let targetCamPos = getCameraPosBySlider(sliderVal, cAngle);
            
            let lookTarget = player.position.clone();
            lookTarget.y += 1.0; 
            
            let dirToCamera = new THREE.Vector3().subVectors(targetCamPos, lookTarget);
            let distToCamera = dirToCamera.length();
            dirToCamera.normalize();
            
            raycaster.set(lookTarget, dirToCamera);
            let hits = raycaster.intersectObjects(terrainMeshes, false);
            
            let isOccluded = false;
            if (hits.length > 0 && hits[0].distance < distToCamera) {
                isOccluded = true;
            }
            
            let targetSliderValue = sliderVal;

            if (isOccluded) {
                // 壁があれば問答無用で極限まで接近する（スライダーを大きく下げる）
                targetSliderValue -= 1.5 * delta; 
            } else {
                // 障害物がない場合は、ゆっくりとデフォルト(0.5)へ戻す
                let returnSpeed = 0.2 * delta; 
                if (targetSliderValue > 0.5) {
                    targetSliderValue -= returnSpeed;
                    if (targetSliderValue < 0.5) targetSliderValue = 0.5;
                } else if (targetSliderValue < 0.5) {
                    targetSliderValue += returnSpeed;
                    if (targetSliderValue > 0.5) targetSliderValue = 0.5;
                }
            }
            
            // スライダーの範囲を 0.0 〜 1.0 に制限
            targetSliderValue = Math.max(0.0, Math.min(1.0, targetSliderValue));
            
            if (sliderVal !== targetSliderValue) {
                window.cameraSliderValue = targetSliderValue;
                sliderVal = targetSliderValue; // このフレームの描画にも適用
                const sliderEl = document.getElementById('camera-slider');
                if (sliderEl) {
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
