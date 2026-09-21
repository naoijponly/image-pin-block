'use strict';

// 実WordPress受入確認で見つかった回帰(PNG書き出しがMixed Contentで
// 失敗する)の再発防止テスト。resolveSameHostHttpsUrl()/normalizeUrl()は
// DOM実測(Image/fetch等)を必要としない純粋関数として scene-assets.js から
// exportされている(唯一の正規化実装。同じ判断を他ファイルへ複製しない。
// scene-assets.jsの他の関数(createAssetStore/loadImage/fetchAsDataUrl)は
// 実DOM・実fetchを要するため、このファイルでは対象にしない。Browser toolでの
// 実機検証で別途確認済み)。

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;

var SceneAssets = require( '../scene-assets.js' );
var resolveSameHostHttpsUrl = SceneAssets.resolveSameHostHttpsUrl;
var normalizeUrl = SceneAssets.normalizeUrl;

var HTTPS_PAGE = { protocol: 'https:', host: 'test.naoijponly.com' };
var HTTP_PAGE = { protocol: 'http:', host: 'test.naoijponly.com' };

describe( 'scene-assets.js: resolveSameHostHttpsUrl — Mixed Content対策の同一ホストhttp→https正規化', function() {
	it( 'HTTPSページ + 同一ホストのhttp画像 -> https へ正規化される(回帰: 以前はhttpのまま渡され、fetch()がMixed Contentでブロックされていた)', function() {
		var result = resolveSameHostHttpsUrl( 'http://test.naoijponly.com/wp-content/uploads/2026/01/photo.jpg', HTTPS_PAGE );
		assert.strictEqual( result, 'https://test.naoijponly.com/wp-content/uploads/2026/01/photo.jpg' );
	} );

	it( '既にhttpsの画像URL -> 変更されない', function() {
		var url = 'https://test.naoijponly.com/wp-content/uploads/2026/01/photo.jpg';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTPS_PAGE ), url );
	} );

	it( 'data: URL -> 変更されない(対象はhttp:のみ)', function() {
		var url = 'data:image/png;base64,AAAA';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTPS_PAGE ), url );
	} );

	it( 'blob: URL -> 変更されない(対象はhttp:のみ)', function() {
		var url = 'blob:https://test.naoijponly.com/1234-5678';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTPS_PAGE ), url );
	} );

	it( '外部ホストのhttp URL -> 同一ホストと見なさず、変更されない(誤って書き換えない)', function() {
		var url = 'http://external-cdn.example.com/image.jpg';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTPS_PAGE ), url );
	} );

	it( 'ページ自身がhttpの場合 -> 書き換えない(HTTPSページでのみ問題になるため)', function() {
		var url = 'http://test.naoijponly.com/wp-content/uploads/2026/01/photo.jpg';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTP_PAGE ), url );
	} );

	it( 'pageLocationが無い(取得できない)場合 -> 書き換えない(安全側に倒す)', function() {
		var url = 'http://test.naoijponly.com/wp-content/uploads/2026/01/photo.jpg';
		assert.strictEqual( resolveSameHostHttpsUrl( url, null ), url );
	} );

	it( '同一ホスト名だがポートが異なる場合 -> 同一ホストと見なさず、変更されない', function() {
		var url = 'http://test.naoijponly.com:8080/image.jpg';
		assert.strictEqual( resolveSameHostHttpsUrl( url, HTTPS_PAGE ), url );
	} );

	it( '空文字/未設定 -> 空文字のまま(既存の空URL扱いを変えない)', function() {
		assert.strictEqual( resolveSameHostHttpsUrl( '', HTTPS_PAGE ), '' );
		assert.strictEqual( resolveSameHostHttpsUrl( null, HTTPS_PAGE ), '' );
	} );

	it( 'クエリ・フラグメント付きの同一ホストhttp URL -> パス以降を保ったままhttpsへ正規化される', function() {
		var result = resolveSameHostHttpsUrl( 'http://test.naoijponly.com/wp-content/uploads/photo.jpg?ver=3#x', HTTPS_PAGE );
		assert.strictEqual( result, 'https://test.naoijponly.com/wp-content/uploads/photo.jpg?ver=3#x' );
	} );
} );

describe( 'scene-assets.js: normalizeUrl — ownerDocument.location経由でも同じ判断になる', function() {
	it( 'ownerDocument.locationがHTTPS + 同一ホストのhttp画像 -> https へ正規化される', function() {
		var fakeOwnerDocument = { location: HTTPS_PAGE };
		var result = normalizeUrl( 'http://test.naoijponly.com/a.jpg', fakeOwnerDocument );
		assert.strictEqual( result, 'https://test.naoijponly.com/a.jpg' );
	} );

	it( 'ownerDocumentもwindowも無い(Node環境相当) -> 書き換えない', function() {
		var url = 'http://test.naoijponly.com/a.jpg';
		assert.strictEqual( normalizeUrl( url, null ), url );
	} );
} );

module.exports = helper.summary( 'scene-assets.test.js' );
