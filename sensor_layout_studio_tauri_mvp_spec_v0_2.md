# Sensor Layout Studio — MVP 設計仕様書

- 版: 0.2 (2026-10-23)
- 用途: ポートフォリオ公開・小規模な実用ツール
- 対象: 車両・ロボットの3Dモデルへのカメラ／LiDARの仮想配置、FOV・障害物確認、座標出力
- 実装方針: **Tauri v2のデスクトップアプリを主軸**とする。React/TypeScript/Three.jsの中核機能はブラウザ版にも再利用可能とする。商用利用可能な依存ライブラリを利用し、第三者コード・素材のライセンスを確認する。
- 最初の対応OS: Windows（将来macOS/Linuxへ拡張可能）
- 追補 (2026-10-25): 車体・障害物に遮られた光線を最初の面で止める、サンプル光線による遮蔽プレビューを追加。
- 追補 (2026-10-26): 遮蔽表示をGPUの画素ごとの三角形交差判定へ変更。角度サンプルの統計は独立した参考値として残す。
- 修正 (2026-10-26): メッシュ輪郭から影の側面を生成。センサと同じ平面・浅い入射角での受光面の自己遮蔽による斑点を修正。
- 追補 (2026-10-27): センサの複数選択、選択センサだけのFOV表示、全選択センサに共通する可視範囲の紫色強調を追加。死角はセンサ単位で赤色＋斜線表示。共通範囲の面積・体積は計算しない。

## 1. ゴール・利用シナリオ

ユーザーが自作または使用権のある車両／ロボットの3Dモデルを読み込み、カメラ／LiDARを複数配置し、画角・測距範囲、仮想障害物との関係を3Dで確認できる。最終的に、`base_link`に対する各センサの姿勢とセンサ間の相対変換をJSONとして出力する。

**MVPの最短シナリオ**
1. 起動時にサンプル車両（自作の簡素なプリミティブモデル）とグリッドが表示される。
2. ローカルGLBを読み込める（GLTFは後述の条件で対応）。
3. カメラ1台とLiDAR1台を追加・命名し、ギズモ／数値入力で位置姿勢を変更できる（M1）。
4. カメラ視錐台、LiDAR測距ボリュームが半透明で動的に更新される。
5. 箱・球・円柱の仮想障害物を追加・移動できる。
6. FOVと障害物との**概略的な重なり**を色で確認できる。
7. センサ・シーン配置をJSON保存／再読込し、`base_link`に対するセンサ姿勢とセンサ間変換をJSONに出力できる。

## 2. スコープ

### MVPに含む
- GLBインポート（GLTF + 外部アセットは必要な場合に対応。GLBを優先）
- 軸・グリッド・Orbit、ズーム、パン、正面／上面／側面プリセット
- シーンツリー（車両、センサ、簡易オブジェクト）、選択、追加、削除、複製
- TransformControls（移動・回転）とXYZ/RPYの数値入力
- カメラ: 水平／垂直FOV、最小／最大表示距離による截頭四角錐
- LiDAR: 水平角範囲、垂直角範囲、最小／最大距離による近似測距ボリューム
- センサごとの色、表示／非表示、半透明度
- 位置・姿勢・設定のJSON出力およびシーン復元
- 最初はプリミティブ障害物とFOVの**概略交差判定**、判定精度をUIに明示（M2）
- 車体・GLB・表示中の障害物・地面に対する、画素ごとの遮蔽判定とFOV表示の切り詰め（2026-10-26更新）
- All／Selected／Commonの視野表示切替。チェックボックス・Ctrlクリックによる複数選択。共通範囲は同一3D地点が全選択センサの範囲内にあり、遮蔽ONではすべてから見える範囲とする。非表示センサは対象外。選択・表示モードは保存対象外のUI状態。

### MVP以降
- 遮蔽・死角のヒートマップ（光線の最初の面での切り詰めは実装済み）
- カバレッジ率、地面上の測距率、2センサの重複率
- センサ外形との**物理的な取り付け衝突**判定
- 非反復スキャンLiDARの実測パターン、実際の反射強度・検出確率の再現
- URDF/xacro、ROS2 static TF用の補助出力、XML/YAMLのエクスポート
- シーンとモデルの一括配布用ZIP、複雑なCAD形式直接対応
- GPUでの高精細ボリューム表示と大量オブジェクトへの最適化

> 【重要】FOV内にある／幾何学的に干渉していることと、実センサに検出されることは別。MVPは認識性能・反射率・画素分解能・スキャン時間を保証しない。

## 3. 技術選定・アーキテクチャ（確定）

- **デスクトップ基盤**: Tauri v2（Rust）
- **フロントエンド**: Vite + React + TypeScript
- **3Dエンジン**: Three.js + `@react-three/fiber` + `@react-three/drei`
- **状態管理**: Zustand（永続化するシーン状態と一時的なUI状態を分離）
- **テスト**: Vitest（座標系・幾何学演算・JSON変換）、必要に応じE2E
- **ネイティブファイル操作**: Tauri v2公式 `dialog`・`fs` プラグイン
- **後続版の高速化**: `three-mesh-bvh`、さらに必要ならRustの計算処理をTauri commandで呼ぶ
- **Pythonバックエンドは使用しない**。MVPの姿勢計算・FOV生成・交差判定はTypeScriptで実装する。

### 境界の分離

1. `domain/` — Pose、Sensor、Scene等の型、行列変換、幾何計算（ブラウザでもそのまま動く純粋なTypeScript）
2. `viewer/` — React Three Fiberによるシーン描画・選択・ギズモ
3. `features/` — センサ追加、編集、シーン管理、エクスポート
4. `platform/` — `FilePlatform`インターフェース。Tauri実装とブラウザ実装を切り替える
5. `src-tauri/` — デスクトップウィンドウ、必要最小限のネイティブI/O・配布設定

フロントエンドの各所から直接 `@tauri-apps/*` を呼ばない。モデル選択・保存・読み込みは `platform` 経由に限定し、将来のWeb体験版に転用する。

### セキュリティと素材

- Tauri v2の権限（capabilities）は必要なAPIだけに限定し、任意のパスへの無制限アクセスを許可しない。
- ファイル選択ダイアログでユーザーが明示的に選んだモデルを読み込む。保存は選択先のみに行う。
- デモモデルはプリミティブで自作し、第三者提供の実車CADや受託案件の機密データを含めない。
- 外部コードを参考・利用する際はライセンス表記と帰属を保持する。


## 4. 座標系・単位・変換の約束

- アプリの基準フレーム: `base_link`。右手系、**X前方・Y左方・Z上方**。ワールドもZ-up。
- 距離: m、角度: 内部rad・UI度数表示。
- UI RPY: roll(X), pitch(Y), yaw(Z) の固定軸回転。合成回転 `R = Rz(yaw) * Ry(pitch) * Rx(roll)`。
- 保存クォータニオン: `[x, y, z, w]`。常に正規化。
- 記法 `T_A_B` は、**Bフレームの座標をAフレームへ変換する**同次変換行列。
- センサiの姿勢は `T_base_sensor_i`。任意センサ間は `T_sensorA_sensorB = inverse(T_base_sensorA) * T_base_sensorB`。
- カメラ表示フレームはセンサ機体と同じX前方・Y左方・Z上方とし、ROS camera_optical（Z前方・X右方・Y下方）は別の固定変換として明記できるようにする。
- glTFのモデル定義はY-upなので、**取込時のモデル座標から`base_link`への調整姿勢をユーザーが指定可能**にする。Y-up→Z-upの初期提案はできるが、前方軸や原点はモデルごとに異なるため勝手に確定しない。
- 車両の3D形状の中心と `base_link` 原点が一致するとは限らない。インポート後の原点位置調整を可能とする。

## 5. シーンデータ（TypeScriptイメージ）

```ts
type Vec3 = [number, number, number];
type Quat = [number, number, number, number]; // x, y, z, w

type Pose = { positionM: Vec3; quaternionXYZW: Quat };

type CameraParams = {
  kind: 'camera';
  horizontalFovDeg: number;
  verticalFovDeg: number;
  nearM: number;
  farM: number;
};

type LidarParams = {
  kind: 'lidar';
  azimuthStartDeg: number;
  azimuthSpanDeg: number; // 360まで
  elevationMinDeg: number;
  elevationMaxDeg: number;
  nearM: number;
  farM: number;
};

type Sensor = {
  id: string;
  name: string;
  parentFrame: 'base_link';
  pose: Pose;
  params: CameraParams | LidarParams;
  color: string;
  visible: boolean;
};

type Primitive = {
  id: string;
  name: string;
  shape: 'box' | 'sphere' | 'cylinder';
  pose: Pose;
  dimensionsM: Vec3; // 球はxを半径に使用するなど形状別に明文化
  visible: boolean;
};

type SceneData = {
  schemaVersion: '0.1.0';
  unit: 'm';
  baseFrame: 'base_link';
  model?: { fileName: string; poseInBase: Pose; scaleFactor: number };
  sensors: Sensor[];
  primitives: Primitive[];
};
```

注: ローカルGLB本体はJSONに含まれない。JSONにモデルファイルの表示名やハッシュを持たせることは可能だが、フルパスを他者に渡すエクスポートへ自動的に含めない。アプリの再起動後に権限が維持されることを前提にせず、シーン復元時には外部モデルの再選択を促す。モデル込みZIPエクスポートは後続版で設計する。

## 6. FOVの幾何形状

### カメラ
- ローカル+Xを向く、近・遠平面でクリップした視錐台。
- 奥行きdにおける半幅 `d * tan(hfov / 2)`、半高 `d * tan(vfov / 2)`。
- near > 0、far > near、0 < hfov,vfov < 180を検証する。

### LiDAR
- 原点から`nearM`〜`farM`、水平方位`azimuthStartDeg`から`azimuthSpanDeg`、上下仰角`elevationMinDeg`〜`elevationMaxDeg`を占める近似的な球面セクタ。
- メッシュは角度方向・半径方向のパラメトリック生成。`azimuthSpanDeg=360`で継ぎ目を処理する。
- `nearM`を持つLiDARでは測距不能な近傍を空洞として描く。
- このボリュームは、点群の実際のスキャンパターンや照射密度を再現しない。

## 7. 干渉判定の段階定義

名前が紛らわしいため、次を区別して表示する。

1. **FOV intersection**: 物体の幾何形状がセンサFOVと重なる。MVPではプリミティブと近似ボリュームで評価し、`possible / none`を表示。厳密なメッシュ間交差と誤認させない。
2. **Occlusion**: センサから対象への線分が車体などで遮られる。画面の各FOV画素を静的メッシュの三角形と照合し、手前に面がある画素を描画しない。測距範囲内の最初の面にはセンサ色を重ねる。影は固定の角度サンプルに依存しないが、入力メッシュ・画面解像度・浮動小数点精度に制約される。LiDAR曲面はポリゴン近似を継続。連続空間の厳密な影の立体形状・体積の計算とヒートマップは後続。光線サンプルの統計は表示と独立した参考値。
3. **Physical collision**: センサ外装と車体や周辺物体が物理的に重なる。センサの筐体寸法を持つ後続版で実装。

最初は「色が付いた＝映像や点群に確実に映る」ではない旨をUIの凡例に明記する。

## 8. UI構成

- 左パネル：シーンツリー、モデル取込、センサ／プリミティブ追加
- 中央：3Dビューポート、座標軸、グリッド、選択ハイライト、視点プリセット
- 右パネル：選択対象の名前・タイプ・座標・姿勢・センサパラメータ、表示切替
- ヘッダー：New / Import Model / Save Scene / Open Scene / Export Transforms（Tauriのネイティブダイアログを使用）
- ビューポート操作：選択→移動／回転ギズモ、数値入力と同期。ドラッグ中はOrbitControlsを無効化。

## 9. 出力

1. **scene.json**：モデル参照、プリミティブ、センサ定義、画角・距離・姿勢（ファイル本体は別）。保存先はネイティブダイアログで選択。
2. **transforms.json**：`T_base_sensor_i`、センサ間`T_sensorA_sensorB`、各センサの平行移動（m）とクォータニオン、同次4x4行列。

行列の格納順（row-major）と変換方向をメタデータに必ず記載する。クォータニオンだけでなく、4x4行列との一致をテストする。

## 10. 実装タスク（推奨順）

### Milestone 1：Tauriデスクトップ版の骨格・配置編集

- [ ] T01 `create-tauri-app`でTauri v2 + React + TS（Vite）プロジェクトを生成。Windows上で`tauri dev`起動確認。
- [ ] T02 R3Fによる3Dビュー、Orbit・グリッド・座標軸、Z-up表示の検証。
- [ ] T03 サンプル車両・GLBインポート、モデル姿勢・縮尺・原点調整。GLBはファイルをバイト列として読み、Three.js GLTFLoaderに渡す。
- [ ] T04 センサ追加・選択・削除とギズモ移動・回転。数値入力と双方向同期。
- [ ] T05 `T_base_sensor`、相対変換の計算とJSONエクスポート。恒等姿勢・90度回転・2センサ相対姿勢のVitest。

**M1受入条件**: Windowsデスクトップウィンドウで3Dモデルに2つ以上のセンサを配置でき、保存した数値が表示と一致し、相対姿勢をJSONで取得できる。

### Milestone 2：MVPとしてのFOV・簡易干渉

- [ ] T06 カメラFOV截頭四角錐、半透明・色・near/far。
- [ ] T07 LiDAR球面セクタ、角度とレンジ編集。
- [ ] T08 プリミティブ追加、FOVとプリミティブの概略交差ハイライト、凡例。
- [ ] T09 `platform`にTauri `dialog`/`fs`実装を追加。scene.json保存・読込と外部GLBの再選択対応。
- [ ] T10 README日英、30秒の操作GIF/動画、公開用サンプル・依存ライセンス確認。Windows向けインストーラー作成を検証。

### Milestone 3：完成度向上（MVP後）

- [x] T11 車体・GLB・障害物・地面に対する画素ごとのGPU遮蔽表示、`three-mesh-bvh`で高速化。独立したサンプル光線の参考統計。ヒートマップは未実装。
- [ ] T12 JSONからURDF固定ジョイント・ROS2 static TF用形式への変換。
- [ ] T13 Windows以外の動作検証、必要に応じブラウザ体験版。


## 11. 受入条件（MVP完成の定義）

- 3Dモデル取込とプリミティブのみのサンプルシーン両方が動く。
- カメラ1台、LiDAR1台を同時に表示し、ドラッグ・数値入力に対してFOVが追従する。
- カメラFOV変更およびLiDAR角度／距離変更でメッシュが更新される。
- 障害物が概略FOVに入ったとき状態が変わり、MVPの精度限界が画面内で分かる。
- 保存→読込の往復でモデル以外のシーン構成が復元され、モデル再取込の案内がある。
- 恒等変換、90度回転、2センサの相対変換、数値入力→出力について自動テストが通る。
- `npm run build`、`npm run test`、Tauriデスクトップビルドが成功し、READMEだけで第三者がWindows上で起動できる。

## 12. ポートフォリオとしての見せ方

- 冒頭に30秒のデモ（GLB取込→センサ配置→FOV変更→障害物検知→TF出力）
- GIF・静止画とWindows向けインストーラーのGitHub Releasesへのリンク（Webデモは将来）
- 解決する課題、実装した範囲、計算上の近似・限界を明記
- カメラ／LiDAR混在の配置例と出力JSONを添付
- 今後のロードマップ（遮蔽・重複率・ROS2エクスポート）を明記

## 13. 参考資料

- Tauri v2プロジェクト作成: https://v2.tauri.app/start/create-project/
- Tauri v2ファイルダイアログ: https://v2.tauri.app/plugin/dialog/
- Tauri v2ファイルシステム: https://v2.tauri.app/plugin/file-system/
- Three.js TransformControls: https://threejs.org/docs/pages/TransformControls.html
- glTF 2.0座標仕様: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- ROS REP-103: https://reps.openrobotics.org/rep-0103/
- three-mesh-bvh: https://github.com/gkjohnson/three-mesh-bvh

## 14. Tauri 初期セットアップ（Windows）

前提: Node.js LTS、Rustツールチェーン、Windows版WebView2、Visual Studio C++ Build Toolsなど、Tauri公式のWindows前提条件を満たすこと。

```powershell
npm create tauri-app@latest sensor-layout-studio
# プロンプトで TypeScript / JavaScript、React、TypeScript を選ぶ
cd sensor-layout-studio
npm install
npm run tauri dev
```

3D/UI・テストのライブラリを追加し、ファイル操作が必要になった段階でTauri公式 `dialog` と `fs` プラグインを導入する。Tauriのセキュリティ設定では必要な権限のみ有効化する。

**ファイルI/Oの設計上の注意**

- `dialog.open()`や`dialog.save()`はユーザーが選んだファイルパスを返す。実際のバイト列の読み書きは `fs` 等で行う。
- Tauri v2の選択ファイルに対する許可範囲は再起動で失われる場合がある。JSONの保存パスがあるだけで自動再読込できるとは想定しない。
- GLBは単独のバイナリファイルであり扱いやすいためMVPの初期形式とする。外部テクスチャ等を別ファイルで参照するgltfは後続対応。

**実装上の優先順位**: まずTauri起動、座標系・センサデータモデル・編集できる3Dシーン・変換出力を安定させ、その後FOV、交差判定、シーン保存へ進む。はじめから高忠実度シミュレーションを狙わない。
