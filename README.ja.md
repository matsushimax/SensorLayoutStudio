# Sensor Layout Studio

**センサーを動かす。視野を変える。共通範囲と死角を、その場で確かめる。**

![カメラとLiDARの配置・共通範囲を確認するSensor Layout Studioの画面](docs/screenshots/common-coverage.png)

## 操作デモ

![カメラの位置・画角・レンジとLiDARの位置・レンジを変え、共通範囲（紫色）と各センサーの死角（赤い斜線）の変化を確認する操作デモ](docs/demo.gif)

**① カメラの移動 → ② カメラの画角 → ③ カメラのレンジ → ④ LiDARの移動 → ⑤ LiDARのレンジ。紫色は両センサーから見える共通範囲、赤い斜線は各センサーの死角です。** 実際のアプリ画面を録画した、待ち時間を短くした4倍速のGIFです。遮蔽と死角表示をONにし、共通範囲と死角の変化を同時に確認できます。

[English](README.md)

車両・ロボット上のカメラやLiDARをどこに取り付けるか、3Dで検討するツールです。配置や視野を変更すると、遮蔽とセンサー同士の共通範囲が更新されます。決めた配置は保存し、センサー間の座標変換をJSONで取り出せます。

**Windowsデスクトップ版／ブラウザー版に対応。モデルは端末内で処理し、サーバーへ送信しません。**

## できること

| やりたいこと                 | 機能                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| 取り付け位置・向きを検討する | 移動・回転ギズモ、数値入力、モデル／別センサー基準の編集、Undo／Redo       |
| 見える範囲を調整する         | カメラの画角、LiDARの方位角・仰角、近距離・遠距離の設定                    |
| 視野の重なりや死角を確認する | 選択センサーだけの表示、共通範囲を紫色、各センサーの死角を赤色＋斜線で表示 |
| 自分の車体・装置を使う       | GLB、STL、STEPの読込、原点・向き・縮尺の調整                               |
| 配置を保存・他の処理へ渡す   | シーンJSON、相対位置・姿勢のプレビュー、Quaternion／4×4変換行列のJSON出力  |

## まずブラウザーで試す

**[ブラウザーで今すぐ試す](https://matsushimax.github.io/SensorLayoutStudio/)** — インストール不要。デモシーンからすぐに操作できます。Windows版の配布は準備中です。

### ローカルで起動する場合

必要なものは **Node.js 22.12以上（24推奨）** とWebGLが使えるブラウザーです。リポジトリをダウンロードまたはcloneし、プロジェクトのフォルダーで実行します。ブラウザー版の起動にRustは不要です。

```sh
npm ci
npm run dev
```

表示された **http://127.0.0.1:1420** を開いてください。Windows PowerShellでnpmの実行が制限される場合は、`npm`を`npm.cmd`に置き換えます。

### 最初の1分

1. 起動時のデモで `front_camera` を選び、移動矢印や回転リングをドラッグします。
2. 右側の **Horizontal FOV**（水平画角）や **Far distance**（最大距離）を変えます。
3. 左側で2台のセンサーにチェックし、**Common** を選びます。紫色が共通範囲です。
4. **Highlight blind spots** をONにすると、各センサーの死角を赤い斜線で確認できます。
5. **Preview transforms** で位置関係を確かめ、**Save scene** で配置を保存します。

左ドラッグで視点を回転、右ドラッグでパン、ホイールでズーム。**F**で選択対象に注目できます。

## モデルの読込

左側の **Import model** から読み込みます。サンプルを使えば、CADデータを用意しなくても確認できます。

| 形式       | 読込時の扱い                                           | サンプル                                                  |
| ---------- | ------------------------------------------------------ | --------------------------------------------------------- |
| GLB        | テクスチャ等を内包したglTF 2.0。Y-up→Z-upを初期提案    | [calibration-box.glb](examples/calibration-box.glb)       |
| STL        | ASCII／バイナリ。初期単位はmm、**STL units**で変更可能 | [calibration-block.stl](examples/calibration-block.stl)   |
| STEP / STP | 端末内でメッシュ化。ファイル内の単位をmへ変換          | [calibration-block.step](examples/calibration-block.step) |

STL／STEPのサンプルは、読込後 **1 × 2 × 3 m** のブロックです。原点・向き・縮尺は元モデルに合わせて確認してください。各ファイル100 MB以下、STL／STEPは50万三角形以下です。STEPには60秒のタイムアウトとキャンセルがあります。

シーンJSONにはモデル本体を含みません。シーンを開き直す際はモデルファイルを再選択します。保存した位置・向き・縮尺は維持されます。

## 結果の読み方

- **紫色**：同じ3D地点が、選択した全センサーの範囲内にあり、遮蔽ONなら全センサーから見える範囲。画面上の色の重なりだけでは判定しません。
- **赤い斜線**：各センサーから見た死角。別のセンサーからは見える場合もあります。
- **possible / none**：障害物と視野の概略的な交差判定。共通範囲や遮蔽とは別の参考値です。

このツールは**配置検討のための可視化**です。精度はモデルの三角形メッシュと描画解像度などに依存します。STEPの曲面もメッシュに近似します。面積・体積・カバレッジ率、検出確率、反射特性は計算しません。大規模モデルでの快適動作は未保証です。

## Windowsアプリを開発・ビルドする

Node.jsに加え、Rust stable MSVC、Visual Studio C++ Build Tools＋Windows SDK、WebView2が必要です。[Tauri公式の前提条件](https://v2.tauri.app/start/prerequisites/)を参照してください。

```sh
npm ci
npm run tauri dev
# 配布用exeとインストーラーを作成
npm run tauri build
```

実行ファイルは `src-tauri/target/release/sensor-layout-studio.exe`、インストーラーは `src-tauri/target/release/bundle/nsis/` に生成します。現在のビルドは未署名です。GitHub Actionsは検証・Windowsビルド・成果物保存に対応し、Releaseの自動公開は行いません。

## 技術と検証

**Tauri v2 / React / TypeScript / Three.js / React Three Fiber / Zustand**。GPUで三角形メッシュとの遮蔽を調べ、センサーごとの可視性を組み合わせて共通範囲を表示します。座標変換の数値テストと、実際の描画結果・編集操作を検証するブラウザーテストを用意しています。

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
```

[操作ガイド・計算上の範囲](docs/usage.ja.md) · [設計と計算の説明](docs/architecture.md) · [検証記録](docs/validation.md) · [デモの再生成](docs/demo-production.md) · [変換出力例](examples/demo.transforms.json)

## ライセンス

アプリのコード・自作ローバー・サンプルモデルは **MIT**。[LICENSE](LICENSE)、[npm依存](THIRD_PARTY_NOTICES.md)、[Rust依存](THIRD_PARTY_RUST_NOTICES.md)を参照してください。STEP変換はOpen CASCADE Technology／occt-import-js（LGPL-2.1、OCCT例外付き）を利用します。[対応ソースと再ビルド手順](docs/cad-runtime.md)を同梱しています。
