'use strict';

var helper = require( './test-helper.js' ).createRunner();
var describe = helper.describe;
var it = helper.it;
var assert = helper.assert;

function FakeElement( ownerDocument, tagName ) {
	this.ownerDocument = ownerDocument;
	this.tagName = tagName;
	this.attributes = {};
	this.style = {};
	this.childNodes = [];
	this.parentNode = null;
	this.textContent = '';
	this.listeners = {};
}

Object.defineProperty( FakeElement.prototype, 'firstChild', {
	get: function() {
		return this.childNodes.length ? this.childNodes[ 0 ] : null;
	}
} );

FakeElement.prototype.appendChild = function( child ) {
	if ( child.parentNode ) {
		child.parentNode.removeChild( child );
	}
	this.childNodes.push( child );
	child.parentNode = this;
	return child;
};

FakeElement.prototype.insertBefore = function( child, reference ) {
	if ( child.parentNode ) {
		child.parentNode.removeChild( child );
	}
	var index = reference ? this.childNodes.indexOf( reference ) : -1;
	if ( index < 0 ) {
		this.childNodes.push( child );
	} else {
		this.childNodes.splice( index, 0, child );
	}
	child.parentNode = this;
	return child;
};

FakeElement.prototype.removeChild = function( child ) {
	var index = this.childNodes.indexOf( child );
	if ( index >= 0 ) {
		this.childNodes.splice( index, 1 );
		child.parentNode = null;
	}
	return child;
};

FakeElement.prototype.setAttribute = function( name, value ) {
	this.attributes[ name ] = String( value );
};

FakeElement.prototype.getAttribute = function( name ) {
	return Object.prototype.hasOwnProperty.call( this.attributes, name ) ? this.attributes[ name ] : null;
};

FakeElement.prototype.removeAttribute = function( name ) {
	delete this.attributes[ name ];
};

FakeElement.prototype.setAttributeNS = function( namespace, name, value ) {
	this.setAttribute( name, value );
};

FakeElement.prototype.removeAttributeNS = function( namespace, localName ) {
	var self = this;
	Object.keys( this.attributes ).forEach( function( name ) {
		if ( name === localName || name.slice( -( localName.length + 1 ) ) === ':' + localName ) {
			delete self.attributes[ name ];
		}
	} );
};

FakeElement.prototype.addEventListener = function( name, listener ) {
	this.listeners[ name ] = listener;
};

FakeElement.prototype.removeEventListener = function( name ) {
	delete this.listeners[ name ];
};

function createFakeDocument() {
	var doc = {
		createElementNS: function( namespace, tagName ) {
			return new FakeElement( doc, tagName );
		}
	};
	doc.documentElement = new FakeElement( doc, 'html' );
	doc.body = new FakeElement( doc, 'body' );
	doc.documentElement.appendChild( doc.body );
	return doc;
}

function walk( root, visitor ) {
	visitor( root );
	root.childNodes.forEach( function( child ) {
		walk( child, visitor );
	} );
}

function findAll( root, predicate ) {
	var matches = [];
	walk( root, function( element ) {
		if ( predicate( element ) ) {
			matches.push( element );
		}
	} );
	return matches;
}

function findByAttribute( root, name, value ) {
	return findAll( root, function( element ) {
		return element.getAttribute( name ) === value;
	} )[ 0 ] || null;
}

function findByClass( root, className ) {
	return findAll( root, function( element ) {
		var names = ( element.getAttribute( 'class' ) || '' ).split( /\s+/ );
		return names.indexOf( className ) !== -1;
	} );
}

function labelModel() {
	return {
		cx: 150,
		cy: 120,
		lines: [ { text: 'Alpha', width: 35 }, { text: 'Beta', width: 28 } ],
		lineHeight: 14,
		bodyWidth: 80,
		bodyHeight: 40,
		paddingY: 6,
		bgColor: 'rgba(255,255,255,0.8)',
		textColor: '#111111',
		strokeColor: '#ffffff',
		strokeWidthPx: 1,
		fontFamily: 'sans-serif',
		fontSize: 12,
		fontWeight: '400',
		fontStyle: 'normal',
		letterSpacing: 0,
		bubblePolygon: {
			pointsAttr: '0,0 80,0 90,20 80,40 0,40',
			bboxLeft: -40,
			bboxTop: -20,
			bboxWidth: 90,
			bboxHeight: 40
		}
	};
}

function popoverModel() {
	return {
		id: 'pin-dot',
		left: 200,
		top: 50,
		width: 200,
		height: 100,
		lines: [ { text: 'First line', width: 60 }, { text: 'Second line', width: 70 } ],
		lineHeight: 18,
		paddingX: 12,
		paddingY: 10,
		bgColor: '#ffffff',
		textColor: '#222222',
		strokeColor: '#ffffff',
		strokeWidthPx: 0,
		fontFamily: 'sans-serif',
		fontSize: 14,
		fontWeight: '400',
		fontStyle: 'normal',
		letterSpacing: 0,
		bubblePolygon: null,
		link: null,
		scrollMaxOffset: 60
	};
}

function resolvedScene() {
	return {
		revision: 3,
		image: { url: 'data:image/png;base64,main', width: 800, height: 600 },
		pins: [
			{
				id: 'pin-dot', cx: 100, cy: 120, hasMarker: false,
				visual: { kind: 'dot', diameter: 24, color: '#e63946' },
				resizeHandle: null,
				label: labelModel(),
				a11y: { kind: 'button', label: 'Alpha', href: null, controlsId: 'ipb-popover-pin-dot' }
			},
			{
				id: 'pin-marker', cx: 400, cy: 300, hasMarker: true,
				visual: { kind: 'marker', url: 'data:image/png;base64,marker', width: 80, height: 40 },
				resizeHandle: { size: 12 },
				label: null,
				a11y: { kind: 'none', label: '', href: null, controlsId: null }
			}
		],
		popover: popoverModel()
	};
}

describe( 'svg-renderer.js: resolved visual scene', function() {
	it( 'Main Image・Pin・Markerを同じSVG Sceneへ描画する', function() {
		var previousDocument = global.document;
		var doc = createFakeDocument();
		global.document = doc;
		try {
			var SvgRenderer = require( '../svg-renderer.js' );
			var host = new FakeElement( doc, 'div' );
			var controller = SvgRenderer.createScene( host, {} );
			controller.setModel( resolvedScene() );
			var svg = controller.getSvgElement();
			var mainLayer = findByAttribute( svg, 'data-layer', 'main-image' );
			var mainImage = mainLayer.childNodes[ 0 ];
			assert.strictEqual( mainImage.tagName, 'image' );
			assert.strictEqual( mainImage.getAttribute( 'href' ), 'data:image/png;base64,main' );
			assert.strictEqual( mainImage.getAttribute( 'width' ), '800' );
			assert.strictEqual( findByClass( svg, 'ipb-pin-visual' ).filter( function( el ) { return el.tagName === 'circle'; } ).length, 1 );
			var marker = findByClass( svg, 'ipb-pin-visual' ).filter( function( el ) { return el.tagName === 'image'; } )[ 0 ];
			assert.strictEqual( marker.getAttribute( 'href' ), 'data:image/png;base64,marker' );
			assert.strictEqual( marker.getAttribute( 'width' ), '80' );
		} finally {
			global.document = previousDocument;
		}
	} );

	it( 'Label・Bubble・Popoverを同じSVG Sceneへ描画し、Popover scrollをclampする', function() {
		var previousDocument = global.document;
		var doc = createFakeDocument();
		global.document = doc;
		try {
			var SvgRenderer = require( '../svg-renderer.js' );
			var host = new FakeElement( doc, 'div' );
			var controller = SvgRenderer.createScene( host, {} );
			controller.setModel( resolvedScene() );
			controller.setRenderState( {
				selectedPinId: 'pin-marker',
				openPopoverPinId: 'pin-dot',
				editorOverlay: true,
				popoverScrollOffset: 999
			} );
			var svg = controller.getSvgElement();
			var labelBubble = findByClass( svg, 'ipb-label-bubble' )[ 0 ];
			assert.ok( labelBubble.getAttribute( 'd' ).indexOf( 'M ' ) === 0 );
			assert.strictEqual( labelBubble.getAttribute( 'fill' ), 'rgba(255,255,255,0.8)' );
			var labelText = findByClass( svg, 'ipb-label-text' )[ 0 ];
			assert.deepStrictEqual( labelText.childNodes.map( function( child ) { return child.textContent; } ), [ 'Alpha', 'Beta' ] );
			var popoverBubble = findByClass( svg, 'ipb-popover-bubble' )[ 0 ];
			assert.ok( popoverBubble.getAttribute( 'd' ).indexOf( 'Q' ) !== -1 );
			var popoverText = findByClass( svg, 'ipb-popover-text' )[ 0 ];
			assert.deepStrictEqual( popoverText.childNodes.map( function( child ) { return child.textContent; } ), [ 'First line', 'Second line' ] );
			assert.strictEqual( popoverText.parentNode.getAttribute( 'transform' ), 'translate(0, -60)' );
			assert.strictEqual( findByClass( svg, 'ipb-resize-handle' ).length, 1 );
			assert.strictEqual( findByClass( svg, 'ipb-selection-ring' ).length, 1 );
		} finally {
			global.document = previousDocument;
		}
	} );

	it( 'model更新で既存Pinノードを再利用し、削除されたPinだけを除去する', function() {
		var previousDocument = global.document;
		var doc = createFakeDocument();
		global.document = doc;
		try {
			var SvgRenderer = require( '../svg-renderer.js' );
			var host = new FakeElement( doc, 'div' );
			var controller = SvgRenderer.createScene( host, {} );
			var firstModel = resolvedScene();
			controller.setModel( firstModel );
			var svg = controller.getSvgElement();
			var originalPin = findByAttribute( svg, 'data-pin-id', 'pin-dot' );
			var nextModel = resolvedScene();
			nextModel.pins = [ nextModel.pins[ 0 ] ];
			nextModel.popover = null;
			controller.setModel( nextModel );
			assert.strictEqual( findByAttribute( svg, 'data-pin-id', 'pin-dot' ), originalPin );
			assert.strictEqual( findByAttribute( findByAttribute( svg, 'data-layer', 'pins' ), 'data-pin-id', 'pin-marker' ), null );
			assert.strictEqual( findByClass( svg, 'ipb-popover' )[ 0 ].style.display, 'none' );
			controller.dispose();
			assert.strictEqual( host.firstChild, null );
		} finally {
			global.document = previousDocument;
		}
	} );
} );

module.exports = helper.summary( 'svg-renderer.test.js' );
