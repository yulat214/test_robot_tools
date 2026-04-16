# test_robot_tools

> ブラウザだけでROS開発を完結させる軽量開発環境

## 概要

本ツールは、Webブラウザ上でロボット開発を1画面で完結させることを目的とした、初学者向け開発環境です。

ROS環境と連携しながら、以下の機能を統合的に提供します：
- Robot Simulator（※物理エンジン不使用）
- Camera
- Log + Log Analyzer
- Editor

ROSの複雑な構成を意識せず、視覚的かつ直感的にロボット開発・検証を行うことができます。

## デモ

※ デモ動画掲載予定

## 想定ユーザー

- ROS初学者
- ロボット開発をこれから学ぶ学生
- ロボットを教える教員
- 環境構築や可視化に手間をかけずに検証したい開発者

## 前提環境

本ツールは以下の環境が整っていることを前提とします：

- ROS 2 Humble 環境（Docker / ホストどちらでも可）
  - 他のDISTROは未検証、これから検証予定です
- Node.js / npm がインストール済み

### Docker利用時の注意

以下のポートが使用可能である必要があります：

- 3000
- 8000
- 9090

### 対応ブラウザ
- Google Chrome

## Node.jsのインストール
```bash
apt install nodejs npm -y
sudo npm install n -g
sudo n stable
sudo apt purge -y nodejs npm
sudo apt autoremove -y
```

## クイックスタート

```bash
cd ~
git clone https://github.com/yulat214/test_robot_tools
cd test_robot_tools
npm install
```
