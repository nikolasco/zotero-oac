/*
 * Copyright (c) 2009,  University of Maryland. All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 * 
 *     * Redistributions of source code must retain the above copyright notice,
 *       this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright notice,
 *       this list of conditions and the following disclaimer in the documentation
 *       and/or other materials provided with the distribution.
 *     * The names of the authors may not be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * Copyright (c) 2009, University of Maryland. All rights reserved.
 * Distributed under the terms of a BSD-style license. See COPYING for details.
 */

// This must come first. It's just an object to use as a namespace
Monomyth = {};
/*
 * Copyright (c) 2009, University of Maryland. All rights reserved.
 * Distributed under the terms of a BSD-style license. See COPYING for details.
 */

(function() {
     this.Monomyth.Class = function(){};
     var doInit = true;

     this.Monomyth.Class.extend = function(opts) {
         // make a skeleton instance to inherit from
         doInit = false;
         var superInst = new this();
         doInit = true;

         // copy methods from the arg
         for (var name in opts) {
             // make sure we're not copying inherited properties...
             if (!opts.hasOwnProperty(name)) continue;
             // if we're overriding a method, prepare this.$super for it
             superInst[name] = (typeof opts[name] == "function" &&
                           typeof superInst[name] == "function") ?
                 (function (funcName, superFunc, curFunc) {
                      return function () {
                          var tmp = this.$super;
                          this.$super = superFunc;
                          var ret = curFunc.apply(this, arguments);
                          this.$super = tmp;
                          return ret;
                      };
                  })(name, superInst[name], opts[name]) :
             opts[name];
         }

         // create our dummy class
         var newClass = function () {
             // don't call init if we're creating a skeleton or we don't have
             // an init method to call
             if (doInit && this.init) {
                 this.init.apply(this, arguments);
             }
         };
         newClass.prototype = superInst;
         // setting the proto will clobber the constructor
         newClass.constructor = newClass;
         // add an extend method to the class
         newClass.extend = arguments.callee;
         return newClass;
     };
})();
