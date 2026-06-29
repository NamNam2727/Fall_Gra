// =====================================
// main.js
// =====================================

function initThreeJS() {
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

    generateMap();
    const boxGeo = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
    const instancedMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const instancedMesh = new THREE.InstancedMesh(boxGeo, instancedMat, gridW * gridD);
    instancedMesh.receiveShadow = true; instancedMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let index = 0;
    for (let i = 0; i < gridW; i++) {
        for (let j = 0; j < gridD; j++) {
            let h = mapData[i][j];
            let px = (i - gridW/2 + 0.5) * blockSize, pz = (j - gridD/2 + 0.5) * blockSize;
            let blockHeight = blockSize + h + 20; 
            dummy.position.set(px, h - blockHeight/2, pz); 
            dummy.scale.set(1, blockHeight / blockSize, 1);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(index, dummy.matrix);
            
            if ((i + j) % 2 === 0) color.setHex(0x4CAF50); else color.setHex(0x81C784);
            instancedMesh.setColorAt(index, color);
            index++;
        }
    }
    scene.add(instancedMesh);

    initPlayer();

    if (window.MultiplayerManager) {
        window.MultiplayerManager.initExistingPlayers();
        setTimeout(() => {
            window.MultiplayerManager.requestPositions();
            window.MultiplayerManager.forceSendPos(); 
        }, 1000);
    }

    updateCamera(true);
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); 
    
    updatePlayer(delta);
    
    if (window.MultiplayerManager) {
        window.MultiplayerManager.update(delta);
    }
    
    updateCamera(false);
    renderer.render(scene, camera);
}

function updatePlayer(delta) {
    const rotationSpeed = 12; 
    
    if (player.chatTimer > 0) {
        player.chatTimer -= delta;
        if (player.chatTimer <= 0 && player.chatSprite) {
            player.remove(player.chatSprite);
            if (player.chatSprite.material.map) player.chatSprite.material.map.dispose();
            player.chatSprite.material.dispose();
            player.chatSprite = null;
        }
    }

    // 1. 地形ブロックとの足場判定（他プレイヤーは一切足場にしない）
    const currentCells = getIntersectingCells(player.position.x, player.position.z, playerRadius);
    let currentGroundY = -100;
    for (let i = 0; i < currentCells.length; i++) {
        const cell = currentCells[i];
        if (cell.h <= player.position.y + stepHeight && cell.h > currentGroundY) {
            currentGroundY = cell.h;
        }
    }

    // 2. 移動入力と地形の壁判定
    if (moveVector.lengthSq() > 0.01) {
        const camForwardX = -Math.sin(cameraAngle), camForwardZ = -Math.cos(cameraAngle);
        const camRightX = Math.cos(cameraAngle), camRightZ = -Math.sin(cameraAngle);
        const moveDirX = camRightX * moveVector.x + camForwardX * (-moveVector.y);
        const moveDirZ = camRightZ * moveVector.x + camForwardZ * (-moveVector.y);
        const moveDirection = new THREE.Vector2(moveDirX, moveDirZ).normalize();
        const inputLength = Math.min(moveVector.length(), 1.0);
        
        const mX = moveDirection.x * (inputLength * moveSpeed) * delta;
        const mZ = moveDirection.y * (inputLength * moveSpeed) * delta;
        const nextX = player.position.x + mX;
        const nextZ = player.position.z + mZ;

        // X軸方向の壁判定（地形のみ）
        if (Math.abs(mX) > 0.001) {
            const cellsX = getIntersectingCells(nextX, player.position.z, playerRadius);
            let canMoveX = true;
            for (let i = 0; i < cellsX.length; i++) {
                if (cellsX[i].h > player.position.y + stepHeight) { canMoveX = false; break; }
            }
            if (canMoveX) player.position.x = nextX;
        }

        // Z軸方向の壁判定（地形のみ）
        if (Math.abs(mZ) > 0.001) {
            const cellsZ = getIntersectingCells(player.position.x, nextZ, playerRadius);
            let canMoveZ = true;
            for (let i = 0; i < cellsZ.length; i++) {
                if (cellsZ[i].h > player.position.y + stepHeight) { canMoveZ = false; break; }
            }
            if (canMoveZ) player.position.z = nextZ;
        }

        const targetRotation = Math.atan2(moveDirection.x, moveDirection.y);
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotation);
        player.quaternion.slerp(targetQuaternion, rotationSpeed * delta);

        if (moveVector.y <= 0.2 && Math.abs(moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotation + Math.PI;
            let diff = targetCameraAngle - cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            cameraAngle += diff * 3.0 * delta;
        }
    }

    // 3. Y座標（ジャンプ・落下）の更新
    if (isJumping) {
        verticalVelocity += gravity * delta;
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
        if (player.position.y > currentGroundY + stepHeight) { 
            isJumping = true; 
            verticalVelocity = 0; 
        } else {
            player.position.y = currentGroundY;
        }
    }
    
    if (player.position.y < -30) {
        player.position.set(0, 20, 0); 
        isJumping = true; 
        verticalVelocity = 0;
    }

    // ★4. 他プレイヤーとの衝突判定（見えない半球壁としての押し出し・滑り落ち）
    // 自身の移動と落下の「後」に処理することで、めり込みを即座に補正する
    if (window.MultiplayerManager) {
        const others = window.MultiplayerManager.otherPlayers;
        for (let id in others) {
            let other = others[id];
            if (other.mesh) {
                let dx = player.position.x - other.mesh.position.x;
                let dz = player.position.z - other.mesh.position.z;
                let dy = player.position.y - other.mesh.position.y;
                let distXZ = Math.hypot(dx, dz);
                
                // お互いの半径を合わせた衝突距離（少し大きめにして壁の厚みを作る）
                let combinedRadius = playerRadius * 1.8; 
                
                // 自分が「相手の足元少し下 〜 相手の頭上少し上」の範囲にいるか
                if (distXZ < combinedRadius && dy > -0.2 && dy < 0.8) {
                    
                    // 完全に座標が一致してしまった場合のゼロ除算回避
                    if (distXZ === 0) {
                        dx = (Math.random() - 0.5) * 0.1;
                        dz = (Math.random() - 0.5) * 0.1;
                        distXZ = Math.hypot(dx, dz);
                    }
                    
                    // どれくらい相手にめり込んでいるか
                    let overlap = combinedRadius - distXZ;
                    
                    if (Math.abs(dy) < 0.4) {
                        // 【同じ高さでの衝突】
                        // 互いに反発するように外側へ押し出す（押し合い）
                        player.position.x += (dx / distXZ) * overlap * 0.5;
                        player.position.z += (dz / distXZ) * overlap * 0.5;
                    } else if (dy >= 0.4) {
                        // 【上に乗った場合】
                        // 頭頂部（半球）を滑り落ちるように、外側へ押し出される。
                        // Y座標は地形の重力に任せて落ちるため、結果的にツルッと滑り落ちる挙動になる。
                        let slideForce = overlap * 0.15; // 滑り落ちる勢い
                        player.position.x += (dx / distXZ) * slideForce;
                        player.position.z += (dz / distXZ) * slideForce;
                    }
                }
            }
        }
    }
}

function updateCamera(instant) {
    const targetCamPos = new THREE.Vector3(
        player.position.x + Math.sin(cameraAngle) * cameraDistance,
        player.position.y + cameraHeight, 
        player.position.z + Math.cos(cameraAngle) * cameraDistance
    );
    if (instant) camera.position.copy(targetCamPos);
    else camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(player.position);
}
