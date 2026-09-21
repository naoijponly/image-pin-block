'use strict';

var fs = require( 'fs' );
var path = require( 'path' );
var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;

var projectRoot = path.resolve( __dirname, '..' );

function readSource( relativePath ) {
	return fs.readFileSync( path.join( projectRoot, relativePath ), 'utf8' );
}

function countMatches( source, pattern ) {
	return ( source.match( pattern ) || [] ).length;
}

function collectArchitectureViolations( sources ) {
	var violations = [];
	var editor = sources[ 'editor.js' ];
	var view = sources[ 'view.js' ];
	var png = sources[ 'png-export.js' ];

	if ( countMatches( editor, /SceneRuntime\.createRuntime\s*\(/g ) < 2 ) {
		violations.push( 'editor.js must use SceneRuntime for Preview and Fullscreen' );
	}
	if ( countMatches( view, /SceneRuntime\.createRuntime\s*\(/g ) < 2 ) {
		violations.push( 'view.js must use SceneRuntime for Frontend and Lightbox' );
	}
	[ 'editor.js', 'view.js' ].forEach( function( file ) {
		if ( /ImagePinBlockSvgRenderer|SvgRenderer\.createScene\s*\(|\.createElementNS\s*\(/.test( sources[ file ] ) ) {
			violations.push( file + ' must not create or call a Visual Renderer directly' );
		}
	} );
	if ( ! /return\s+SceneRuntime\.resolveScene\s*\(/.test( png ) ) {
		violations.push( 'png-export.js must resolve the shared Scene' );
	}
	if ( ! /var\s+scene\s*=\s*SvgRenderer\.createScene\s*\(/.test( png ) ) {
		violations.push( 'png-export.js must use the shared SvgRenderer' );
	}
	if ( 1 !== countMatches( png, /ctx\.drawImage\s*\(/g ) ) {
		violations.push( 'png-export.js must rasterize the completed SVG exactly once' );
	}
	if ( /ctx\.(?:fillText|strokeText|measureText|arc|ellipse|fillRect|strokeRect|moveTo|lineTo)\s*\(/.test( png ) ) {
		violations.push( 'png-export.js must not redraw individual Visuals on Canvas' );
	}

	var visualTokens = /ipb-pin-visual|ipb-label-bubble|ipb-label-text|ipb-popover-bubble|data-layer=['"](?:main-image|pins|labels|popover)['"]/;
	Object.keys( sources ).forEach( function( file ) {
		if ( file !== 'svg-renderer.js' && visualTokens.test( sources[ file ] ) ) {
			violations.push( file + ' contains Visual Renderer-specific output' );
		}
		if ( file !== 'svg-renderer.js' && file !== 'scene-text.js' && /\.createElementNS\s*\(/.test( sources[ file ] ) ) {
			violations.push( file + ' creates SVG outside the Renderer or Text measurement module' );
		}
		if ( /function\s+(?:buildPinVisualOnly|CanvasPopoverPreview|applyPinScale|applyMarkerSize|positionLabelForPin|positionPopover|drawPinForExport|drawPngLabel|drawPngTail)\s*\(/.test( sources[ file ] ) ) {
			violations.push( file + ' reintroduces a removed surface-specific rendering path' );
		}
	} );

	return violations;
}

function currentSources() {
	var sources = {};
	function collect( relativeDirectory ) {
		var directory = path.join( projectRoot, relativeDirectory );
		fs.readdirSync( directory, { withFileTypes: true } ).forEach( function( entry ) {
			var relativePath = path.join( relativeDirectory, entry.name );
			if ( entry.isDirectory() ) {
				if ( [ '.git', 'docs', 'languages', 'node_modules', 'tests' ].indexOf( entry.name ) === -1 ) {
					collect( relativePath );
				}
				return;
			}
			if ( /\.(?:js|php|css)$/.test( entry.name ) ) {
				var sourceKey = relativePath.split( path.sep ).join( '/' );
				sources[ sourceKey ] = readSource( relativePath );
			}
		} );
	}
	collect( '' );
	return sources;
}

describe( 'single Visual Renderer architecture guard', function() {
	it( 'Editor・Frontend・Lightbox・PNG Exportが共通Scene/Runtime/Renderer経路を維持する', function() {
		assert.deepStrictEqual( collectArchitectureViolations( currentSources() ), [] );
	} );

	it( '別SVG Rendererをview.jsへ追加した場合は検出する', function() {
		var sources = currentSources();
		sources[ 'view.js' ] += '\ndocument.createElementNS("http://www.w3.org/2000/svg", "circle");\n';
		assert.ok( collectArchitectureViolations( sources ).some( function( message ) {
			return message.indexOf( 'view.js' ) !== -1;
		} ) );
	} );

	it( 'PNG専用のVisual別Canvas描画を追加した場合は検出する', function() {
		var sources = currentSources();
		sources[ 'png-export.js' ] += '\nctx.fillText("duplicate", 0, 0);\n';
		assert.ok( collectArchitectureViolations( sources ).some( function( message ) {
			return message.indexOf( 'must not redraw individual Visuals' ) !== -1;
		} ) );
	} );
} );

module.exports = helper.summary( 'renderer-architecture.test.js' );
