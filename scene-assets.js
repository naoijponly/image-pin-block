/**
 * Image Pin Block — 共通Asset Resolutionモジュール。
 *
 * Main Image / Marker画像の解決(decode・実寸取得)・共有cacheと、PNG書き出し用の
 * 自己完結化(bytes取得→data URL化)をこの1ファイルへ集約する。Pin/Marker/Labelの
 * 配置(Geometry)は一切行わない(scene-model.js/geometry.jsの責務)。
 *
 * ─── cache方針 ───
 * 旧実装の`markerNaturalSizes[pinId]`(Pin ID単位のcache)を廃止し、
 * resource identity(正規化したURL文字列)単位でcacheする(17節)。同じMarker URLを
 * 使う複数のPinは同じ解決結果を共有し、あるPinのMarker URLを変更しても、別の
 * (まだ使われている)URLの解決結果には影響しない。非同期結果の順序が入れ替わっても
 * (例: 先に呼んだ方が後で解決する)、Promiseベースのcacheにより常に同じURLに対する
 * 呼び出しは同じ結果へ収束する(呼び出し側は最新のsetAttributes呼び出しに対応する
 * revisionと比較して、古い結果を破棄すること。scene-runtime.js参照)。
 */
( function( root, factory ) {
	'use strict';
	var api = factory();
	if ( 'undefined' !== typeof module && module.exports ) {
		module.exports = api;
	}
	if ( root ) {
		root.ImagePinBlockSceneAssets = api;
	}
} )(
	( 'undefined' !== typeof window ) ? window : ( ( 'undefined' !== typeof global ) ? global : null ),
	function() {
		'use strict';

		// HTTPSページ上で、現在ページと同一ホストのhttp:// URL
		// (以前保存された記事の添付ファイルURL等。保存schemaは百分率同様http/https
		// 表記を区別せず保存されている)を、https://へ書き換える(Mixed Content対策)。
		//
		// 実WordPress環境で、HTTPSの編集画面から`fetch()`で同一ホストのhttp:// URLを
		// 取得しようとすると、ブラウザに"Mixed Content: ... was blocked"として拒否される
		// (通常の<img src="http://...">表示は多くのブラウザが暗黙にhttps://へ
		// auto-upgradeして見た目には成立するため、この失敗はPNG書き出し
		// (fetch()による自己完結化)でのみ表面化していた)。
		//
		// 外部ホストのhttp:// URLは対象外(誤って書き換えない。ページ自身がhttpsでない
		// 場合も書き換えない)。pageLocationはwindow.location互換の{protocol, host}
		// (Node上の単体テスト用に素のオブジェクトも受け付ける)。
		function resolveSameHostHttpsUrl( url, pageLocation ) {
			var str = String( url || '' );
			if ( ! /^http:\/\//i.test( str ) ) {
				return str; // https:/data:/blob:等はそのまま(対象はhttp:のみ)
			}
			if ( ! pageLocation || 'https:' !== pageLocation.protocol ) {
				return str; // ページ自体がhttpsでなければ書き換える理由がない
			}
			var afterScheme = str.slice( 'http://'.length );
			var targetHost = afterScheme.split( /[\/?#]/ )[ 0 ];
			if ( ! targetHost || targetHost !== pageLocation.host ) {
				return str; // 外部ホストのhttp URLは対象外(誤って書き換えない)
			}
			return 'https://' + afterScheme;
		}

		// URLを正規化する(cache keyとして使う値であり、Asset解決・Renderer・PNG Export
		// (fetchAsDataUrl)が実際に使うURLそのものでもある。同一責務の正規化を複数箇所へ
		// 増やさないよう、resolveSameHostHttpsUrl()をここに集約する)。
		// ownerDocument省略時はグローバルwindow.locationを見る(Node環境ではwindow自体が
		// 存在しないため、その場合はページ位置不明としてhttp→https変換は行わない)。
		function normalizeUrl( url, ownerDocument ) {
			var pageLocation = ( ownerDocument && ownerDocument.location ) ||
				( ( 'undefined' !== typeof window ) ? window.location : null );
			return resolveSameHostHttpsUrl( String( url || '' ), pageLocation );
		}

		// <img>要素の実寸(naturalWidth/naturalHeight)が確定した状態のimgを解決する
		// Promiseを返す。load イベントを正とする(HTML標準上、loadが発火した時点で
		// naturalWidth/Heightは確定済みであり、decode()の対応状況に関わらず信頼できる)。
		// decode()はペイント前の完全デコードを保証する追加の best-effort 待ちとして
		// 使うが、DOM未接続のimg要素に対してdecode()が解決しないまま無期限にハングする
		// 既知の問題があるため(実機検証で確認済み)、短いタイムアウト付きで
		// 「decode()が終わっていなくてもload済みなら採用する」形にする(5節: 実寸が
		// 取れればそれで十分。decode()のハングでpipeline全体が止まる方が害が大きい)。
		var DECODE_WAIT_TIMEOUT_MS = 200;
		function loadImage( url, ownerDocument ) {
			return new Promise( function( resolve, reject ) {
				var doc = ownerDocument || ( ( 'undefined' !== typeof document ) ? document : null );
				var img = doc ? doc.createElement( 'img' ) : new Image();
				// data: URLにはCORSの概念が無く、crossOrigin指定が一部環境でdecode()の
				// ハングを誘発する例があったため、http(s)等の外部URLにのみ付与する。
				if ( ! /^data:/i.test( String( url ) ) ) {
					img.crossOrigin = 'anonymous';
				}
				var settled = false;
				function finish( ok ) {
					if ( settled ) {
						return;
					}
					settled = true;
					if ( ok && img.naturalWidth > 0 ) {
						resolve( img );
					} else {
						reject( new Error( ( ok ? 'image-decoded-with-zero-size: ' : 'image-load-failed: ' ) + url ) );
					}
				}
				img.onload = function() {
					if ( 'function' !== typeof img.decode ) {
						finish( true );
						return;
					}
					var decodeSettled = false;
					img.decode().then( function() {
						decodeSettled = true;
						finish( true );
					}, function() {
						// decode()が失敗しても、loadで実寸は既に確定しているため採用する。
						decodeSettled = true;
						finish( true );
					} );
					setTimeout( function() {
						if ( ! decodeSettled ) {
							finish( true );
						}
					}, DECODE_WAIT_TIMEOUT_MS );
				};
				img.onerror = function() {
					finish( false );
				};
				img.src = url;
			} );
		}

		// AssetStore: 1つのブロックインスタンス(scene-runtime)につき1つ作る。
		// Main Image・Marker画像をURL単位でcacheし、Promiseをそのままcacheすることで
		// 同一URLへの同時解決要求を1回のloadへ集約する。
		function createAssetStore() {
			var imageCache = {}; // url -> Promise<{url, img, naturalWidth, naturalHeight}>
			var disposed = false;

			function resolveImage( url, ownerDocument ) {
				var key = normalizeUrl( url, ownerDocument );
				if ( ! key ) {
					return Promise.reject( new Error( 'empty-image-url' ) );
				}
				if ( imageCache[ key ] ) {
					return imageCache[ key ];
				}
				var promise = loadImage( key, ownerDocument ).then( function( img ) {
					var resolved = {
						url: key,
						img: img,
						naturalWidth: img.naturalWidth || 0,
						naturalHeight: img.naturalHeight || 0
					};
					// peek()が同期的に最新の解決結果を返せるよう、Promiseオブジェクト自身に
					// 結果を控えておく(Promiseの値は本来.then()以外から同期的に読めないため)。
					promise.resolvedValue = resolved;
					return resolved;
				} );
				imageCache[ key ] = promise;
				// 失敗したURLは再試行できるよう、cacheへ残さない(画像を選び直した後の
				// 再試行等で古い失敗結果を返し続けないようにする)。
				promise.catch( function() {
					if ( imageCache[ key ] === promise ) {
						delete imageCache[ key ];
					}
				} );
				return promise;
			}

			return {
				resolveMainImage: function( url, ownerDocument ) {
					return resolveImage( url, ownerDocument );
				},
				resolveMarkerImage: function( url, ownerDocument ) {
					return resolveImage( url, ownerDocument );
				},
				// 既にcache済みの結果があれば同期的に返す(まだなければnull)。
				// Rendererが「今すぐ描画できるか」を確認する用途(非同期を待たずに
				// 前回の解決結果を再利用できるかを見る)。
				peek: function( url, ownerDocument ) {
					var key = normalizeUrl( url, ownerDocument );
					return ( key && imageCache[ key ] && imageCache[ key ].resolvedValue ) || null;
				},
				dispose: function() {
					disposed = true;
					imageCache = {};
				},
				isDisposed: function() {
					return disposed;
				}
			};
		}

		// ─── Export資源の自己完結化(PNG書き出し用) ───
		// SVGを画像化する際、外部URL参照(<image href="https://...">)が残っていると
		// CORS・ネットワーク到達性次第でCanvasが汚染されたり、そもそも読み込めない
		// (14節・22節・43節)。実際にbytesを取得できた画像だけをdata URLへ変換し、
		// SVG文字列へ埋め込む。取得できない場合は明示的なエラーとして呼び出し側へ返す
		// (勝手なproxy追加はしない)。
		//
		// credentials: 'omit' だと、同一オリジンのWordPress画像
		// (メディアライブラリの添付ファイル等)であっても、ログイン状態を要求する
		// サイト構成(限定公開の投稿・一部のセキュリティプラグイン等)ではCookie無しの
		// 匿名リクエストとして扱われ、取得に失敗する場合があった(画面表示自体は
		// <img crossorigin="anonymous">で行っており、CORSチェックに失敗しても
		// <img>は「表示はできるがcanvasからは読めない(tainted)」状態で成立するため、
		// 見た目には問題が出ない。一方fetch()はCORSチェックに失敗すると
		// レスポンスそのものを一切取得できない。この非対称性により「画面表示は正常だが
		// PNG保存だけ失敗する」症状になっていた)。credentials: 'same-origin' へ変更する
		// ことで、実際に同一オリジンのリクエストにはCookieを送り(ログイン状態を
		// 要求する構成でも取得できるようにする)、真にクロスオリジンのURLでは
		// 従来どおりCookieを送らない(挙動は変えない)。CDN等、本当にCORSヘッダーを
		// 返さないクロスオリジンのURLは、この変更後も引き続き明示的なエラーとして
		// 失敗する(それが期待仕様)。
		function fetchAsDataUrl( url ) {
			return fetch( url, { mode: 'cors', credentials: 'same-origin' } ).then( function( response ) {
				if ( ! response.ok ) {
					throw new Error( 'export-resource-fetch-failed: ' + url + ' (HTTP ' + response.status + ')' );
				}
				return response.blob();
			}, function( networkErr ) {
				// fetch()自体の失敗(CORS拒否・ネットワーク到達不可等)。ブラウザの既定の
				// エラーメッセージはURLを含まないことが多いため、どのURLで失敗したかを
				// 開発者が追えるよう付与して再throwする(呼び出し側でconsole.errorする際に
				// 実際の失敗段階が分かるようにする。利用者向けUI文言は変更しない)。
				throw new Error( 'export-resource-fetch-network-error: ' + url + ' (' + ( ( networkErr && networkErr.message ) || networkErr ) + ')' );
			} ).then( function( blob ) {
				return new Promise( function( resolve, reject ) {
					var reader = new FileReader();
					reader.onload = function() { resolve( reader.result ); };
					reader.onerror = function() { reject( new Error( 'export-resource-read-failed: ' + url ) ); };
					reader.readAsDataURL( blob );
				} );
			} );
		}

		return {
			createAssetStore: createAssetStore,
			loadImage: loadImage,
			fetchAsDataUrl: fetchAsDataUrl,
			// normalizeUrl/resolveSameHostHttpsUrlはDOM実測を必要としない純粋関数の
			// ため、そのままexportしてNode上で単体テストできるようにする
			// (resolvePinA11y(scene-runtime.js)と同じ理由・同じ方針)。
			normalizeUrl: normalizeUrl,
			resolveSameHostHttpsUrl: resolveSameHostHttpsUrl
		};
	}
);
