const RT_GNDPLANE = 0;    // An endless 'ground plane' surface in xy plane
const RT_DISK     = 1;    // a circular disk in xy plane, radius 'diskRad'
const RT_SPHERE   = 2;    // A sphere, radius 1, centered at origin.
const RT_BOX      = 3;    // An axis-aligned cube, corners at (+/-1, +/-1,+/-1)
const RT_CYLINDER = 4;    // A cylinder with user-settable radius at each end
                        // and user-settable length.  radius of 0 at either
                        // end makes a cone; length of 0 with nonzero
                        // radius at each end makes a disk.
const RT_TRIANGLE = 5;    // a triangle with 3 vertices.
const RT_BLOBBY   = 6;

function CGeom(shapeSelect) {
    if(shapeSelect == undefined) shapeSelect = RT_GNDPLANE;	// default shape.
	this.shapeType = shapeSelect;

    switch(this.shapeType) {
        case RT_GNDPLANE: //--------------------------------------------------------
            //set the ray-tracing function (so we call it using item[i].traceMe() )
            this.traceMe = function(inR,hitlist) { return this.traceGrid(inR,hitlist); }; 
            this.xgap = 1.0;	// line-to-line spacing
            this.ygap = 1.0;
            this.lineWidth = 0.1;	// fraction of xgap used for grid-line width
            this.lineColor = vec4.fromValues(0.1,0.5,0.1,1.0);  // green
            this.gapColor = vec4.fromValues(0.9,0.9,0.9,1.0);  // near-white
            break;
        case RT_DISK:
            this.traceMe = function(inR,hitlist) { return this.traceDisk(inR,hitlist); }; 
            this.xgap = 61/107;
            this.ygap = 61/107;
            this.lineWidth = 0.1;
            this.lineColor = vec4.fromValues(0.7,0.2,0.7,1.0);  // purple
            this.gapColor = vec4.fromValues(0.9,0.9,0.2,1.0);  // yellow
            break;
        case RT_SPHERE:
            this.traceMe = function(inR,hitlist) { return this.traceSphere(inR,hitlist); };
            this.lineColor = vec4.fromValues(0.0,0.2,0.7,1.0);  // blue
            break;
        default:
            console.log("CGeom() constructor: ERROR! INVALID shapeSelect:", shapeSelect);
            return;
    }
    this.worldRay2model = mat4.create();
    this.normal2world = mat4.create();  // == worldRay2model^T
                                        // This matrix transforms MODEL-space
                                        // normals (where they're easy to find)
                                        // to WORLD-space coords (where we need
                                        // them for lighting calcs.)
}

/**
 * set worldRay2model to identity matrix.
 */
CGeom.prototype.setIdent = function() {
    mat4.identity(this.worldRay2model);  
    mat4.identity(this.normal2world);
}

/**
 * Do a inverse translation on worldRay2model.
 */
CGeom.prototype.rayTranslate = function(x,y,z) {
//==============================================================================
//  Translate ray-tracing's current drawing axes (defined by worldRay2model),
//  by the vec3 'offV3' vector amount
    var a = mat4.create();   // construct INVERSE translation matrix [T^-1]
    a[12] = -x; // x  
    a[13] = -y; // y
    a[14] = -z; // z.
    //print_mat4(a,'translate()');
    mat4.multiply(this.worldRay2model, a, this.worldRay2model); // [new] == [T^-1]*[OLD]
    mat4.transpose(this.normal2world, this.worldRay2model); // model normals->world
}

CGeom.prototype.rayRotate = function(rad, ax, ay, az) {
//==============================================================================
// Rotate ray-tracing's current drawing axes (defined by worldRay2model) around
// the vec3 'axis' vector by 'rad' radians.
// (almost all of this copied directly from glMatrix mat4.rotate() function)
    var x = ax, y = ay, z = az,
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;
    if (Math.abs(len) < glMatrix.GLMAT_EPSILON) { 
        console.log("CGeom.rayRotate() ERROR!!! zero-length axis vector!!");
        return null; 
        }
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(-rad);     // INVERSE rotation; use -rad, not rad
    c = Math.cos(-rad);
    t = 1 - c;
    // Construct the elements of the 3x3 rotation matrix. b_rowCol
    // CAREFUL!  I changed something!!
    /// glMatrix mat4.rotate() function constructed the TRANSPOSE of the
    // matrix we want (probably because they used these b_rowCol values for a
    // built-in matrix multiply).
    // What we want is given in https://en.wikipedia.org/wiki/Rotation_matrix at
    //  the section "Rotation Matrix from Axis and Angle", and thus
    // I swapped the b10, b01 values; the b02,b20 values, the b21,b12 values.
    b00 = x * x * t + c;     b01 = x * y * t - z * s; b02 = x * z * t + y * s; 
    b10 = y * x * t + z * s; b11 = y * y * t + c;     b12 = y * z * t - x * s; 
    b20 = z * x * t - y * s; b21 = z * y * t + x * s; b22 = z * z * t + c;
    var b = mat4.create();  // build 4x4 rotation matrix from these
    b[ 0] = b00; b[ 4] = b01; b[ 8] = b02; b[12] = 0.0; // row0
    b[ 1] = b10; b[ 5] = b11; b[ 9] = b12; b[13] = 0.0; // row1
    b[ 2] = b20; b[ 6] = b21; b[10] = b22; b[14] = 0.0; // row2
    b[ 3] = 0.0; b[ 7] = 0.0; b[11] = 0.0; b[15] = 1.0; // row3
//    print_mat4(b,'rotate()');
    mat4.multiply(this.worldRay2model,      // [new] =
                    b, this.worldRay2model);  // [R^-1][old]
    mat4.transpose(this.normal2world, this.worldRay2model); // model normals->world

}
    
CGeom.prototype.rayScale = function(sx,sy,sz) {
//==============================================================================
//  Scale ray-tracing's current drawing axes (defined by worldRay2model),
//  by the vec3 'scl' vector amount
    if(Math.abs(sx) < glMatrix.GLMAT_EPSILON ||
        Math.abs(sy) < glMatrix.GLMAT_EPSILON ||
        Math.abs(sz) < glMatrix.GLMAT_EPSILON) {
        console.log("CGeom.rayScale() ERROR!! zero-length scale!!!");
        return null;
        }
    var c = mat4.create();   // construct INVERSE scale matrix [S^-1]
    c[ 0] = 1/sx; // x  
    c[ 5] = 1/sy; // y
    c[10] = 1/sz; // z.
//  print_mat4(c, 'scale()')'
    mat4.multiply(this.worldRay2model,      // [new] =
                c, this.worldRay2model);  // =[S^-1]*[OLD]
    mat4.transpose(this.normal2world, this.worldRay2model); // model normals->world
}

CGeom.prototype.traceDisk = function(wRay, hit, myHitList) {
    // Find intersection of CRay object 'wRay' with grid-plane at z== this.zGrid
    // return -1 if ray MISSES the plane
    // return  0 if ray hits BETWEEN lines
    // return  1 if ray hits ON the lines
    // wRay is in world coord.
    var mRay = new CRay();  // model coord ray

    vec4.transformMat4(mRay.orig, wRay.orig, this.worldRay2model);
    vec4.transformMat4(mRay.dir, wRay.dir, this.worldRay2model);
    var nearFlag = 1;

    var t0 = (-mRay.orig[2]) / mRay.dir[2];
    if(t0 < 0) {
        // ray is BEHIND eyepoint, or the hit point is farther than prev hit.
        return false;  
    }
    vec4.scaleAndAdd(hit.modelHitPt, mRay.orig, mRay.dir, t0 - g_myScene.RAY_EPSILON);
    vec4.scaleAndAdd(hit.hitPt, wRay.orig, wRay.dir, t0 - g_myScene.RAY_EPSILON);
    
    if (hit.modelHitPt[0]*hit.modelHitPt[0] + hit.modelHitPt[1]*hit.modelHitPt[1] > 2*2){
        return false;
    }

    if (wRay.isShadowRay){
        return true;
    }
    myHitList.hitlist.push(hit);
    myHitList.iEnd = myHitList.hitlist.length-1;
    var nearestHit = myHitList.hitlist[myHitList.iNearest];

    if (t0 > nearestHit.t0){
        // the hit point is farther than nearest hit
        nearFlag = 0;
    } else {
        myHitList.iNearest = myHitList.iEnd;  // update new nearest index
    }

    // update hit variables
    hit.t0 = t0;
    hit.hitGeom = this;

    vec4.negate(hit.viewN, wRay.dir);
    vec4.normalize(hit.viewN, hit.viewN);
    vec4.transformMat4(hit.surfNorm, vec4.fromValues(0,0,1,0), this.normal2world);
    vec4.normalize(hit.surfNorm, hit.surfNorm);
    
    if (nearFlag == 1){
        var loc = Math.abs(hit.modelHitPt[0] / this.xgap);  // how many 'xgaps' from the origin
        if(loc%1 < this.lineWidth) {  // hit a line of constant-x?
            hit.hitNum = 1;
            return;
        }
        loc = Math.abs(hit.modelHitPt[1] / this.ygap);  // how many 'ygaps' from origin
        if(loc%1 < this.lineWidth) {  // hit a line of constant-y?
            hit.hitNum = 1;
            return;
        }
        hit.hitNum = 0;
        return;
    }
}

CGeom.prototype.traceGrid = function(wRay, myHitList) {
    // Find intersection of CRay object 'wRay' with grid-plane at z== this.zGrid
    // return -1 if ray MISSES the plane
    // return  0 if ray hits BETWEEN lines
    // return  1 if ray hits ON the lines
    // wRay is in world coord.
    var mRay = new CRay();  // model coord ray
    var hit = new CHit();
    hit.init();

    vec4.transformMat4(mRay.orig, wRay.orig, this.worldRay2model);
    vec4.transformMat4(mRay.dir, wRay.dir, this.worldRay2model);

    var t0 = (-mRay.orig[2]) / mRay.dir[2];
    if(t0 < 0) {
        // ray is BEHIND eyepoint. Missed
        return false;  
    }
    if (wRay.isShadowRay){
        return true;
    }

    myHitList.hitlist.push(hit);
    myHitList.iEnd = myHitList.hitlist.length-1;
    var nearestHit = myHitList.hitlist[myHitList.iNearest];
    
    if (t0 <= nearestHit.t0){
        // the hit point is nearer than nearest hit
        myHitList.iNearest = myHitList.iEnd;  // update new nearest index
    }

    // update hit for all hited objects no matter distance.
    hit.t0 = t0;
    hit.hitGeom = this;

    vec4.scaleAndAdd(hit.modelHitPt, mRay.orig, mRay.dir, hit.t0 - g_myScene.RAY_EPSILON);
    vec4.scaleAndAdd(hit.hitPt, wRay.orig, wRay.dir, hit.t0 - g_myScene.RAY_EPSILON);

    vec4.negate(hit.viewN, wRay.dir);
    vec4.normalize(hit.viewN, hit.viewN);
    vec4.transformMat4(hit.surfNorm, vec4.fromValues(0,0,1,0), this.normal2world);
    vec4.normalize(hit.surfNorm, hit.surfNorm);
    
    var loc = Math.abs(hit.modelHitPt[0] / this.xgap);  // how many 'xgaps' from the origin
    if(loc%1 < this.lineWidth) {  // hit a line of constant-x?
        hit.hitNum = 1;
        return;
    }
    loc = Math.abs(hit.modelHitPt[1] / this.ygap);  // how many 'ygaps' from origin
    if(loc%1 < this.lineWidth) {  // hit a line of constant-y?
        hit.hitNum = 1;
        return;
    }
    hit.hitNum = 0;

    return;
}

CGeom.prototype.traceDisk = function(wRay, myHitList) {
    // Find intersection of CRay object 'wRay' with grid-plane at z== this.zGrid
    // return -1 if ray MISSES the plane
    // return  0 if ray hits BETWEEN lines
    // return  1 if ray hits ON the lines
    // wRay is in world coord.
    var mRay = new CRay();  // model coord ray
    var hit = new CHit();
    hit.init();

    vec4.transformMat4(mRay.orig, wRay.orig, this.worldRay2model);
    vec4.transformMat4(mRay.dir, wRay.dir, this.worldRay2model);

    var t0 = (-mRay.orig[2]) / mRay.dir[2];
    if(t0 < 0) {
        // ray is BEHIND eyepoint
        return false;  
    }
    vec4.scaleAndAdd(hit.modelHitPt, mRay.orig, mRay.dir, t0 - g_myScene.RAY_EPSILON);
    vec4.scaleAndAdd(hit.hitPt, wRay.orig, wRay.dir, t0 - g_myScene.RAY_EPSILON);
    
    if (hit.modelHitPt[0]*hit.modelHitPt[0] + hit.modelHitPt[1]*hit.modelHitPt[1] > 2*2){
        return false;
    }

    if (wRay.isShadowRay){
        return true;
    }
    myHitList.hitlist.push(hit);
    myHitList.iEnd = myHitList.hitlist.length-1;
    var nearestHit = myHitList.hitlist[myHitList.iNearest];

    if (t0 <= nearestHit.t0){
        // the hit point is nearer than nearest hit
        myHitList.iNearest = myHitList.iEnd;  // update new nearest index
    }

    // update hit variables
    hit.t0 = t0;
    hit.hitGeom = this;

    vec4.negate(hit.viewN, wRay.dir);
    vec4.normalize(hit.viewN, hit.viewN);
    vec4.transformMat4(hit.surfNorm, vec4.fromValues(0,0,1,0), this.normal2world);
    vec4.normalize(hit.surfNorm, hit.surfNorm);
    
    var loc = Math.abs(hit.modelHitPt[0] / this.xgap);  // how many 'xgaps' from the origin
    if(loc%1 < this.lineWidth) {  // hit a line of constant-x?
        hit.hitNum = 1;
        return;
    }
    loc = Math.abs(hit.modelHitPt[1] / this.ygap);  // how many 'ygaps' from origin
    if(loc%1 < this.lineWidth) {  // hit a line of constant-y?
        hit.hitNum = 1;
        return;
    }
    hit.hitNum = 0;
    return;
}

CGeom.prototype.traceSphere = function(wRay, myHitList) {
    // Find intersection of CRay object 'wRay' with grid-plane at z== this.zGrid
    // return -1 if ray MISSES the plane
    // return  0 if ray hits BETWEEN lines
    // return  1 if ray hits ON the lines
    // wRay is in world coord.

    var mRay = new CRay();  // model coord ray
    var hit = new CHit();
    hit.init();

    vec4.transformMat4(mRay.orig, wRay.orig, this.worldRay2model);
    vec4.transformMat4(mRay.dir, wRay.dir, this.worldRay2model);
    // var nearFlag = 1;

    var r2s = vec4.create();  // from ray start point to sphere center
    vec4.subtract(r2s, vec4.fromValues(0,0,0,1), mRay.orig);  // in model space. sphere center always at origin
    var L2 = vec3.dot(r2s,r2s);  // the squared length of r2s
    if(L2 <= 1.0) {  // from inside, radius == 1
        hit.isEntering = false;
        // console.log("CGeom.traceSphere() ERROR! rayT origin at or inside sphere!\n\n");
        return false;
    }

    var tcaS = vec3.dot(mRay.dir, r2s);  // SCALED tca
    if (tcaS < 0.0) {  // Missed
        return false;
    }

    var DL2 = vec3.dot(mRay.dir, mRay.dir);  // length(tdir)^2
    var tca2 = tcaS*tcaS / DL2;

    var LM2 = L2 - tca2;  
    if(LM2 > 1.0) {  // Missed
      return false;
    }

    if (wRay.isShadowRay){  // hit something.
        return true;
    }

    var L2hc = (1.0 - LM2); // SQUARED half-chord length.

    var t0 = tcaS / DL2 - Math.sqrt(L2hc / DL2);

    myHitList.hitlist.push(hit);
    myHitList.iEnd = myHitList.hitlist.length-1;
    var nearestHit = myHitList.hitlist[myHitList.iNearest];

    if(t0 <= nearestHit.t0) {    // is this new hit-point Farther than 'myHit'?
        myHitList.iNearest = myHitList.iEnd;  // update new nearest index   
        // nearFlag = 0;
    }

    // update hit variables
    hit.t0 = t0;
    hit.hitGeom = this;

    vec4.scaleAndAdd(hit.modelHitPt, mRay.orig, mRay.dir, hit.t0 - g_myScene.RAY_EPSILON);
    vec4.scaleAndAdd(hit.hitPt, wRay.orig, wRay.dir, hit.t0 - g_myScene.RAY_EPSILON);

    vec4.negate(hit.viewN, wRay.dir);
    vec4.normalize(hit.viewN, hit.viewN);
    vec4.transformMat4(hit.surfNorm, vec4.fromValues(0,0,1,0), this.normal2world);
    vec4.normalize(hit.surfNorm, hit.surfNorm);

    // if (nearFlag == 1){
        hit.hitNum = 1;
    // }
    return;
}