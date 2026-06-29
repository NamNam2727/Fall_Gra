// =====================================
// main.js
// 新しい地形(BufferGeometry)とRaycasterによる3D物理演算
// =====================================

// グローバル変数の追加（Raycaster用）
let mapMesh;
let raycaster = new THREE.Raycaster();
let downVector = new THREE.Vector3(0, -1, 0);

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

    // ★旧来のInstancedMeshによるマップ生成を削除し、新しいMapGeneratorを呼び出す
    if (window.MapGenerator && typeof window.MapGenerator.createMesh === 'function') {
        mapMesh = window.MapGenerator.createMesh();
        scene.add(mapMesh);
    } else {
        console.error("MapGeneratorが見つかりません。mapGenerator.jsが読み込まれているか確認してください。");
    }

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

    // ★1. Raycasterによる3D床判定（トンネル・坂道対応）
    let currentGroundY = -100;
    let groundNormal = new THREE.Vector3(0, 1, 0);
    
    if (mapMesh) {
        // キャラクターの少し上（トンネルの天井に邪魔されない高さ）から真下へ光線を飛ばす
        let rayOffsetHeight = typeof playerRadius !== 'undefined' ? playerRadius * 3 : 3.0;
        let origin = new THREE.Vector3(player.position.x, player.position.y + rayOffsetHeight, player.position.z);
        
        raycaster.set(origin, downVector);
        // マップメッシュとの交差点（床）を探す
        let intersects = raycaster.intersectObject(mapMesh, false);
        
        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            // 坂道でキャラを傾けるための「面の向き（法線）」を取得
            groundNormal.copy(intersects[0].face.normal);
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(mapMesh.matrixWorld);
            groundNormal.applyMatrix3(normalMatrix).normalize();
        }
    }

    // ★2. 移動入力と、Raycasterによる坂道・壁判定
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

        let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
        let rayOffsetHeight = typeof playerRadius !== 'undefined' ? playerRadius * 3 : 3.0;

        // X軸方向の段差・壁判定
        let canMoveX = true;
        if (Math.abs(mX) > 0.001 && mapMesh) {
            raycaster.set(new THREE.Vector3(nextX, player.position.y + rayOffsetHeight, player.position.z), downVector);
            let interX = raycaster.intersectObject(mapMesh, false);
            // 移動先の床が、自分が登れる段差（stepHeight）より高ければ壁とみなす
            if (interX.length > 0 && interX[0].point.y > player.position.y + myStepHeight) {
                canMoveX = false; 
            }
        }
        if (canMoveX) player.position.x = nextX;

        // Z軸方向の段差・壁判定
        let canMoveZ = true;
        if (Math.abs(mZ) > 0.001 && mapMesh) {
            raycaster.set(new THREE.Vector3(player.position.x, player.position.y + rayOffsetHeight, nextZ), downVector);
            let interZ = raycaster.intersectObject(mapMesh, false);
            if (interZ.length > 0 && interZ[0].point.y > player.position.y + myStepHeight) {
                canMoveZ = false; 
            }
        }
        if (canMoveZ) player.position.z = nextZ;

        // ★キャラクターを坂道に沿って傾ける処理
        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        // 進行方向を向く回転
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
        // 地面の法線（傾き）に合わせる回転
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), groundNormal);
        
        // 傾きと進行方向の回転を合成する
        const targetQuaternion = tiltQuat.multiply(rotQuat);
        player.quaternion.slerp(targetQuaternion, rotationSpeed * delta);

        if (moveVector.y <= 0.2 && Math.abs(moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotationY + Math.PI;
            let diff = targetCameraAngle - cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            cameraAngle += diff * 3.0 * delta;
        }
    } else {
        // 停止中も地面の傾きに合わせて直立させる（スノボのように斜面に立つ）
        const currentRotY = new THREE.Euler().setFromQuaternion(player.quaternion, 'YXZ').y;
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentRotY);
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), groundNormal);
        player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);
    }

    // ★3. Y座標（ジャンプ・落下と坂道の吸い付き）の更新
    let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;

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
        // 地面から離れたらジャンプ（落下）状態へ
        if (player.position.y > currentGroundY + myStepHeight) { 
            isJumping = true; 
            verticalVelocity = 0; 
        } else {
            // スティックを倒すだけで坂道をスムーズに登り降りできるよう、床の高さにスナップさせる
            // 急なガタつきを防ぐため lerp を使って滑らかに沿わせる
            player.position.y += (currentGroundY - player.position.y) * 0.3;
        }
    }
    
    if (player.position.y < -30) {
        player.position.set(0, 20, 0); 
        isJumping = true; 
        verticalVelocity = 0;
    }

    // ★4. 他プレイヤーとの衝突判定（見えない半球壁としての押し出し・滑り落ち）
    if (window.MultiplayerManager) {
        const others = window.MultiplayerManager.otherPlayers;
        let myRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.0;
        
        for (let id in others) {
            let other = others[id];
            if (other.mesh) {
                let dx = player.position.x - other.mesh.position.x;
                let dz = player.position.z - other.mesh.position.z;
                let dy = player.position.y - other.mesh.position.y;
                let distXZ = Math.hypot(dx, dz);
                
                // お互いの半径を合わせた衝突距離（少し大きめにして壁の厚みを作る）
                let combinedRadius = myRadius * 1.8; 
                
                // 自分が「相手の足元少し下 〜 相手の頭上少し上」の範囲にいるか
                if (distXZ < combinedRadius && dy > -0.2 && dy < 0.8) {
                    
                    if (distXZ === 0) { // ゼロ除算回避
                        dx = (Math.random() - 0.5) * 0.1;
                        dz = (Math.random() - 0.5) * 0.1;
                        distXZ = Math.hypot(dx, dz);
                    }
                    
                    let overlap = combinedRadius - distXZ;
                    
                    if (Math.abs(dy) < 0.4) {
                        // 【同じ高さでの衝突】互いに反発するように外側へ押し出す
                        player.position.x += (dx / distXZ) * overlap * 0.5;
                        player.position.z += (dz / distXZ) * overlap * 0.5;
                    } else if (dy >= 0.4) {
                        // 【上に乗った場合】頭頂部（半球）を滑り落ちるように、外側へ押し出される
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
