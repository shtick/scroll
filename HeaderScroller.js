HeaderScroller = function(targetImg, logoImg, displacementMap)
{
    this._canvas = null;
    this._gl = null;
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._vertexShader = null;
    this._fragmentShader = null;
    this._program = null;
    this._positionAttrib = 0;
    this._uvAttrib = 0;
    this._amountLoc = null;
    this._phaseLoc = null;
    this._phase = 0;
    this._amount = 0;
    this._amountTarget = 0;
    this._cutOff = 1;
    this._cutOffTarget = 0;
    this._aspectRatio = 1;
    this._logoImg = logoImg;
    this._init(targetImg, logoImg, displacementMap);

    // adjustable properties:
    this.strengthX = -0.0725;
    this.strengthY = 4.875;
    this.animationSpeed = 1.2;
    this.hardness = 30.0;
};

HeaderScroller.prototype =
{
    _updateContentHeight: function()
    {
        var scrolling = (document.documentElement && document.documentElement.scrollTop) ||
                         document.body.scrollTop;

        this._cutOffTarget = scrolling / this._canvas.clientHeight;
        this._amountTarget = scrolling / this._canvas.clientHeight;
        if (this._amountTarget < 0) this._amountTarget = 0;
        if (this._amountTarget > 1) this._amountTarget = 1;
    },

    _init: function(targetImg, logoImg, displacementMap)
    {
        this._canvas = document.createElement("canvas");
        this._initWebGL();
        if (!this._gl) return;

        //for (var key in targetImg.style) {
        //    if (targetImg.style.hasOwnProperty(key))
        //        this._canvas.style[key] = targetImg.style[key];
        //}
        this._canvas.style.position = "absolute";
        this._canvas.style.width = "100%";
        this._canvas.style.border = "none";
        this._canvas.style.zIndex = "-500000";
        this._aspectRatio = targetImg.naturalWidth / targetImg.naturalHeight;
        this._resize();

        this._texture = this._initTexture(targetImg, this._gl.CLAMP_TO_EDGE);
        this._logoTexture = this._initTexture(logoImg, this._gl.CLAMP_TO_EDGE);
        this._displacementMap = this._initTexture(displacementMap, this._gl.REPEAT);

        var container = targetImg.parentNode;
        container.insertBefore(this._canvas, targetImg);
        targetImg.style.visibility = "hidden";

        logoImg.style.visibility = "hidden";

        self.requestAnimationFrame(this._render.bind(this));
    },

    _initWebGL: function()
    {
        var webglFlags = { antialias:false, depth:false };
        this._gl = this._canvas.getContext('webgl', webglFlags) || this._canvas.getContext('experimental-webgl', webglFlags);
        if (!this._gl) return;

        var vertices = [    -1, 1, 0, 1,
                            1, 1, 1, 1,
                            1, -1, 1, 0,
                            -1, -1, 0, 0 ];
        var indices = [0, 1, 2, 0, 2, 3];

        this._vertexBuffer = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._vertexBuffer);
        this._gl.bufferData(this._gl.ARRAY_BUFFER, new Float32Array(vertices), this._gl.STATIC_DRAW);

        this._indexBuffer = this._gl.createBuffer();
        this._gl.bindBuffer(this._gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        this._gl.bufferData(this._gl.ELEMENT_ARRAY_BUFFER, new Int16Array(indices), this._gl.STATIC_DRAW);

        this._initProgram();
    },

    _initTexture: function(img, wrap)
    {
        var texture = this._gl.createTexture();

        this._gl.bindTexture(this._gl.TEXTURE_2D, texture);
        this._gl.pixelStorei(this._gl.UNPACK_FLIP_Y_WEBGL, 1);
        this._gl.texImage2D(this._gl.TEXTURE_2D, 0, this._gl.RGBA, this._gl.RGBA, this._gl.UNSIGNED_BYTE, img);

        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MIN_FILTER, this._gl.LINEAR);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_MAG_FILTER, this._gl.LINEAR);

        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_S, wrap);
        this._gl.texParameteri(this._gl.TEXTURE_2D, this._gl.TEXTURE_WRAP_T, wrap);

        return texture;
    },

    _initProgram: function()
    {
        this._vertexShader = this._gl.createShader(this._gl.VERTEX_SHADER);
        if (!this._initShader(this._vertexShader, HeaderScroller.VERTEX_SHADER)) {
            console.warn("Failed generating vertex shader");
            return;
        }

        this._fragmentShader = this._gl.createShader(this._gl.FRAGMENT_SHADER);
        if (!this._initShader(this._fragmentShader, HeaderScroller.FRAGMENT_SHADER)) {
            console.warn("Failed generating fragment shader:");
            return;
        }

        this._program = this._gl.createProgram();

        this._gl.attachShader(this._program, this._vertexShader);
        this._gl.attachShader(this._program, this._fragmentShader);
        this._gl.linkProgram(this._program);

        if (!this._gl.getProgramParameter(this._program, this._gl.LINK_STATUS)) {
            var log = this._gl.getProgramInfoLog(this._program);
            console.warn("Error in program linking:" + log);
            return;
        }

        this._positionAttrib = this._gl.getAttribLocation(this._program, "position");
        this._uvAttrib = this._gl.getAttribLocation(this._program, "texCoord");

        this._gl.useProgram(this._program);
        var texLoc = this._gl.getUniformLocation(this._program, "source");
        this._gl.uniform1i(texLoc, 0);
        texLoc = this._gl.getUniformLocation(this._program, "displacementMap");
        this._gl.uniform1i(texLoc, 1);
        texLoc = this._gl.getUniformLocation(this._program, "logo");
        this._gl.uniform1i(texLoc, 2);
        this._amountLoc = this._gl.getUniformLocation(this._program, "amount");
        this._cutoffLoc = this._gl.getUniformLocation(this._program, "cutoff");
        this._hardnessLoc = this._gl.getUniformLocation(this._program, "hardness");
        this._phaseLoc = this._gl.getUniformLocation(this._program, "phase");
        this._logoUVScaleLoc = this._gl.getUniformLocation(this._program, "logoUVScale");
    },

    _initShader: function(shader, code)
    {
        this._gl.shaderSource(shader, code);
        this._gl.compileShader(shader);

        // Check the compile status, return an error if failed
        if (!this._gl.getShaderParameter(shader, this._gl.COMPILE_STATUS)) {
            console.warn(this._gl.getShaderInfoLog(shader));
            return false;
        }

        return true;
    },

    _render: function()
    {
        self.requestAnimationFrame(this._render.bind(this));

        this._resize();
        this._updateContentHeight();

        var gl = this._gl;

        this._amount = (this._amountTarget + this._amount) * .5;
        this._cutOff = (this._cutOffTarget + this._cutOff) * .5;
        this._phase += .01;
        //this._gl.uniform1f(this._amountLoc, Math.sin(this._phase) *.5 +.5);
        this._gl.uniform1f(this._phaseLoc, this._phase * this.animationSpeed);
        this._gl.uniform1f(this._cutoffLoc, this._cutOff * 1.1);
        this._gl.uniform1f(this._hardnessLoc, this.hardness);
        this._gl.uniform2f(this._amountLoc, this._amount * this.strengthX, this._amount * this.strengthY);

        gl.viewport(0, 0, this._canvas.clientWidth, this._canvas.clientHeight);

        //gl.clearColor(Math.random(), Math.random(), Math.random(), 1.0);
        //gl.clear(this._gl.COLOR_BUFFER_BIT);
        gl.useProgram(this._program);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);

        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);

        gl.vertexAttribPointer(this._positionAttrib, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(this._uvAttrib, 2, gl.FLOAT, false, 16, 8);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._displacementMap);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this._logoTexture);

        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    },

    _resize: function()
    {
        var w = this._canvas.clientWidth === 0? window.innerWidth : this._canvas.clientWidth;
        var height = Math.round(w / this._aspectRatio);
        this._canvas.width = this._canvas.clientWidth;
        this._canvas.style.height = height + "px";
        this._canvas.height = height;

        // this tries to get the pencil in clear view
        var diff = Math.min(window.innerHeight - height, 0.0);
        this._canvas.style.top = diff+"px";

        var w = Math.min(this._logoImg.naturalWidth, this._canvas.width);
        var h = w / this._logoImg.naturalWidth * this._logoImg.naturalHeight;
        if (h > this._canvas.height) {
            h = this._canvas.height;
            w = h * this._logoImg.naturalWidth * this._logoImg.naturalHeight;
        }
        this._gl.uniform2f(this._logoUVScaleLoc, this._canvas.width / w, this._canvas.height / h);
    }
};

HeaderScroller.VERTEX_SHADER =
    [
        "precision highp float;" +
        "attribute vec4 position;",
        "attribute vec2 texCoord;",

        "varying vec2 uv;",

        "void main()",
        "{",
        "   uv = texCoord;",
        "   gl_Position = position;",
        "}"
    ].join("\n");

HeaderScroller.FRAGMENT_SHADER =
    [
        "precision highp float;" +
        "varying vec2 uv;",

        "uniform sampler2D source;",
        "uniform sampler2D displacementMap;",
        "uniform sampler2D logo;",

        "uniform vec2 amount;",
        "uniform float phase;",
        "uniform float hardness;",
        "uniform float cutoff;",
        "uniform vec2 logoUVScale;",

        "void main()",
        "{",
        "   vec2 sampleUV = uv;",
        "   vec2 offset;",
        "   offset.x = sin(uv.x * 15.0 + phase) * .05;",
        "   offset.y = cos(uv.y * 15.0 + phase) * .05;",
        "   sampleUV += (texture2D(displacementMap, uv * 1.2 + offset).xy - .5) * amount;",
        "   vec4 imgColor = texture2D(source, sampleUV);",
        "   vec2 logoUV = (sampleUV - .5) * logoUVScale + .5;",
        "   vec4 logoColor = texture2D(logo, logoUV);",
        "   gl_FragColor = mix(imgColor, logoColor, logoColor.w);",
        "   if (sampleUV.y > 1.0) gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);",
        "   if (sampleUV.y < cutoff) {",
        "       float amount = clamp((cutoff - sampleUV.y) * hardness, 0.0, 1.0);",
        "       gl_FragColor = mix(gl_FragColor, vec4(1.0), amount);",
        "   }",
        "}"
    ].join("\n");

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
// requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
// MIT license
(function () {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
    }
    if(!window.requestAnimationFrame)
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
                    callback(currTime + timeToCall);
                },
                timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    if(!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
}());