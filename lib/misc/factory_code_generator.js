/* istanbul ignore next */
(function (module, exports) {
    "use strict";

    /**
     * @module opcua.miscellaneous
     */
    require("requirish")._(module);
    var assert = require("better-assert");
    var fs = require("fs");
    var path = require("path");

    var schema_helpers = require("lib/misc/factories_schema_helpers");
    var getFactory = require("lib/misc/factories_factories").getFactory;

    var extract_all_fields = schema_helpers.extract_all_fields;
    var resolve_schema_field_types = schema_helpers.resolve_schema_field_types;
    var check_schema_correctness = schema_helpers.check_schema_correctness;

    var _ = require("underscore");

    //xx var factories = require("lib/misc/factories");

    var objectNodeIds = require("lib/opcua_node_ids").ObjectIds;

    var ec = require("lib/misc/encode_decode");

    //xx var BaseUAObject = require("lib/misc/factories_baseobject").BaseUAObject;


    var utils = require("lib/misc/utils");
    var debugLog = utils.make_debugLog(__filename);
    //xx var doDebug = utils.checkDebugFlag(__filename);

    var getTempFilename = utils.getTempFilename;
    var normalize_require_file = utils.normalize_require_file;
    var LineFile = require("lib/misc/linefile").LineFile;


    exports.folder_for_generated_file = path.normalize(getTempFilename("../_generated_"));

    if (fs.existsSync && !fs.existsSync(exports.folder_for_generated_file)) {
        fs.mkdirSync(exports.folder_for_generated_file);
    }


    function get_class_javascript_filename(schema_name, optional_folder) {

        var folder = exports.folder_for_generated_file;
        if (optional_folder) {
            folder = path.normalize(path.join(process.cwd(), optional_folder));
        }
        return path.join(folder, "_auto_generated_" + schema_name + ".js");
    }

    exports.get_class_javascript_filename = get_class_javascript_filename;


    function get_class_javascript_filename_local(schema_name) {

        var generate_source = getFactory(schema_name).prototype._schema.generate_source;
        if (!generate_source) {
            var folder = exports.folder_for_generated_file;
            generate_source = path.join(folder, "_auto_generated_" + schema_name + ".js");
        }
        return generate_source;

    }

    var RUNTIME_GENERATED_ID = -1;


    function write_enumeration_define(f, schema, field, member, i) {

        assert(f instanceof LineFile);
        function write() {
            f.write.apply(f, arguments);
        }

        var __member = "$" + member;

        assert(!field.isArray); // would not work in this case

        write("    \"" + member + "\": {");
        write("        hidden: false,");
        write("        enumerable: true,");
        write("        configurable: false,");
        write("            get: function() {");
        //xx write(" console.log('GET');");
        write("                return this." + __member + ";");
        write("            },");
        write("            set: function(value) {");
        //xx write(" console.log('set',value);");
        write("                var coercedValue = _enumerations." + field.fieldType + ".typedEnum.get(value);");
        write("                /* istanbul ignore next */");
        write("                if ( coercedValue === undefined || coercedValue === null) {");
        write("                      throw new Error(\"value cannot be coerced to " + field.fieldType + ": \" + value);");
        write("                }");
        write("                this." + __member + " = coercedValue;");
        write("            }");
        write("    },");
        write("    \"" + __member + "\": {");
        write("         configurable: false,");
        write("         value: 'aaaa',");
        write("         hidden: true,");
        write("         writable: true,");
        write("         enumerable: false");
        write("    },");
    }

    function write_enumeration(f, schema, field, member, i) {

        assert(f instanceof LineFile);
        function write() {
            f.write.apply(f, arguments);
        }

        //xx var __member = "$" + member;

        assert(!field.isArray); // would not work in this case

        write("    self." + member + " = initialize_field(schema.fields[" + i + "]" + ", options." + field.name + ");");

    }

    function write_complex(f, schema, field, member/*, i*/) {

        assert(f instanceof LineFile);
        function write() {
            f.write.apply(f, arguments);
        }

        if (field.isArray) {
            if (field.hasOwnProperty("defaultValue")) {
                //todo: fix me => should call field defaultValue in the live version
                write("    self." + member + " = null;");
            } else {
                write("    self." + member + " = [];");
            }
            write("    if (options." + member + ") {");
            write("        assert(_.isArray(options." + member + "));");
            write("        self." + member + " = options." + member + ".map(function(e){ return new " + field.fieldType + "(e); } );");
            write("    }");
        } else {
            if (field.defaultValue === null || field.fieldType === schema.name) {
                write("    self." + member + " = (options." + member + ") ? new " + field.fieldType + "( options." + member + ") : null;");
            } else {
                write("    self." + member + " =  new " + field.fieldType + "( options." + member + ");");
            }
        }

    }

    function write_basic(f, schema, field, member, i) {
        assert(f instanceof LineFile);
        function write() {
            f.write.apply(f, arguments);
        }

        assert(field.category === "basic");

        if (field.isArray) {
            write("    self." + member + " = initialize_field_array(schema.fields[" + i + "]" + ", options." + field.name + ");");
        } else {
            write("    self." + member + " = initialize_field(schema.fields[" + i + "]" + ", options." + field.name + ");");
        }

    }


    /* eslint complexity:[0,50],  max-statements: [1, 250]*/
    function produce_code(schema_file, schema_name, source_file) {

        var is_complex_type;
        var i, field, fieldType, member, __member;


        var full_path_to_schema = path.resolve(schema_file).replace(/\\/g, "/");

        debugLog("\nfull_path_to_schema    ".red, full_path_to_schema);

        var relative_path_to_schema = normalize_require_file(__dirname, full_path_to_schema);
        debugLog("relative_path_to_schema".red, relative_path_to_schema);

        var local_schema_file = normalize_require_file(path.dirname(source_file), full_path_to_schema);
        debugLog("local_schema_file      ".red, local_schema_file);

        var schema = require(relative_path_to_schema)[schema_name];

        check_schema_correctness(schema);

        if (!schema) {
            throw new Error(" Cannot find schema " + schema_name + " in " + relative_path_to_schema);
        }
        var name = schema.name;

        // check the id of the object binary encoding
        var encoding_BinaryId = schema.id;
        var encoding_XmlId;
        if (encoding_BinaryId === undefined) {
            encoding_BinaryId = objectNodeIds[name + "_Encoding_DefaultBinary"];
            encoding_XmlId = objectNodeIds[name + "_Encoding_DefaultXml"];
        } else {
            //xx debugLog(schema_file,schema.name, id);
            //xx  assert(id === RUNTIME_GENERATED_ID);
        }
        if (!encoding_BinaryId) {
            throw new Error("" + name + " has no _Encoding_DefaultBinary id\nplease add a Id field in the structure definition");
        }


        var encodingBinaryNodeId = (encoding_BinaryId === RUNTIME_GENERATED_ID ) ? encoding_BinaryId : ec.makeExpandedNodeId(encoding_BinaryId);
        var encodingXmlNodeId = (encoding_XmlId ) ? ec.makeExpandedNodeId(encoding_XmlId) : null;


        schema.baseType = schema.baseType || "BaseUAObject";

        var baseclass = schema.baseType;


        var classname = schema.name;


        var f = new LineFile();

        function write() {
            f.write.apply(f, arguments);
        }

        resolve_schema_field_types(schema);
        var complexTypes = schema.fields.filter(function (field) {
            return field.category === "complex" && field.fieldType !== schema.name;
        });

        var folder_for_source_file = path.dirname(source_file);

// -------------------------------------------------------------------------
// - insert common require's
// -------------------------------------------------------------------------
        write("\"use strict\";");
        write("require(\"requirish\")._(module);");
        write("/**");
        write(" * @module opcua.address_space.types");
        write(" */");
        write("var assert = require(\"better-assert\");");
        write("var util = require(\"util\");");
        write("var _  = require(\"underscore\");");
        write("var makeNodeId = require(\"lib/datamodel/nodeid\").makeNodeId;");
        write("var schema_helpers =  require(\"lib/misc/factories_schema_helpers\");");

        write("var extract_all_fields                       = schema_helpers.extract_all_fields;");
        write("var resolve_schema_field_types               = schema_helpers.resolve_schema_field_types;");
        write("var initialize_field                         = schema_helpers.initialize_field;");
        write("var initialize_field_array                   = schema_helpers.initialize_field_array;");
        write("var check_options_correctness_against_schema = schema_helpers.check_options_correctness_against_schema;");
        write("var _defaultTypeMap = require(\"lib/misc/factories_builtin_types\")._defaultTypeMap;");

        write("var ec = require(\"lib/misc/encode_decode\");");
        write("var encodeArray = ec.encodeArray;");
        write("var decodeArray = ec.decodeArray;");
        write("var makeExpandedNodeId = ec.makeExpandedNodeId;");

        write("var generate_new_id = require(\"lib/misc/factories\").generate_new_id;");
        write("var _enumerations = require(\"lib/misc/factories_enumerations\")._private._enumerations;");

// -------------------------------------------------------------------------
// - insert schema
// -------------------------------------------------------------------------

        write("var schema = require(\"" + local_schema_file + "\")." + classname + "_Schema;");

// -------------------------------------------------------------------------
// - insert definition of complex type used by this class
// -------------------------------------------------------------------------

        var tmp_map = {};
        complexTypes.forEach(function (field) {
            var filename = get_class_javascript_filename_local(field.fieldType);
            if (tmp_map.hasOwnProperty(filename)) {
                return;
            }
            tmp_map[filename] = 1;
            var local_filename = normalize_require_file(folder_for_source_file, filename);
            write("var " + field.fieldType + " = require(\"" + local_filename + "\")." + field.fieldType + ";");
        });

// -------------------------------------------------------------------------
// - insert definition of base class
// -------------------------------------------------------------------------
        write("var BaseUAObject = require(\"lib/misc/factories_baseobject\").BaseUAObject;");
        if (baseclass !== "BaseUAObject") {
            var filename = get_class_javascript_filename_local(baseclass);

            var local_filename = normalize_require_file(folder_for_source_file, filename);

            write("var " + baseclass + " = require(\"" + local_filename + "\")." + baseclass + ";");
        }

        function makeFieldType(field) {
            return "{" + field.fieldType + (field.isArray ? "[" : "") + (field.isArray ? "]" : "") + "}";
        }

// -------------------------------------------------------------------------
// - insert class enumeration properties
// -------------------------------------------------------------------------
        var has_enumeration = false;
        var n = schema.fields.length;
        for (i = 0; i < n; i++) {
            if (schema.fields[i].category === "enumeration") {
                has_enumeration = true;
                break;
            }
        }
        if (has_enumeration) {
            write("");
            write("//## Define special behavior for Enumeration");
            write("var _enum_properties = {");

            for (i = 0; i < n; i++) {
                field = schema.fields[i];
                member = field.name;
                if (field.category === "enumeration") {
                    write_enumeration_define(f, schema, field, member, i);
                }
            }

            write("};");
            write("");
        }

// -------------------------------------------------------------------------
// - insert class constructor
// -------------------------------------------------------------------------

        write("");
        write("/**");
        if (schema.documentation) {
            write(" * " + schema.documentation);
        }
        write(" * ");
        write(" * @class " + classname);
        write(" * @constructor");
        write(" * @extends " + baseclass);
        // dump parameters

        write(" * @param  options {Object}");
        var def = "";
        for (i = 0; i < n; i++) {
            field = schema.fields[i];
            fieldType = field.fieldType;
            var documentation = field.documentation ? field.documentation : "";
            def = "";
            if (field.defaultValue !== undefined) {
                if (_.isFunction(field.defaultValue)) {
                    def = " = " + field.defaultValue();
                } else {
                    def = " = " + field.defaultValue;
                }
            }
            var ft = makeFieldType(field);
            write(" * @param  [options." + field.name + def + "] " + ft + " " + documentation);
        }

        write(" */");

        write("function " + classname + "(options)");
        write("{");
        // write("    var value;");
        write("    options = options || {};");
        write("    /* istanbul ignore next */");
        write("    if (schema_helpers.doDebug) { check_options_correctness_against_schema(this,schema,options); }");
        write("    var self = this;");
        write("    assert(this instanceof BaseUAObject); //  ' keyword \"new\" is required for constructor call')");
        write("    resolve_schema_field_types(schema);");
        write("");

        if (_.isFunction(schema.construct_hook)) {
            write("    //construction hook");
            write("    options = schema.construct_hook(options); ");

        }
        if (baseclass) {
            write("    " + baseclass + ".call(this,options);");
        }

        for (i = 0; i < n; i++) {

            field = schema.fields[i];

            fieldType = field.fieldType;

            member = field.name;
            __member = "__" + member;

            write("");
            write("    /**");
            documentation = field.documentation ? field.documentation : "";
            write("      * ", documentation);
            write("      * @property ", field.name);
            // write("      * @type {", (field.isArray ? "Array[" : "") + field.fieldType + (field.isArray ? " ]" : "")+"}");
            write("      * @type " + makeFieldType(field));

            if (field.defaultValue !== undefined) {
                write("      * @default  ", field.defaultValue);
            }

            write("      */");


            if (field.category === "enumeration") {

                write_enumeration(f, schema, field, member, i);

            } else if (field.category === "complex") {

                write_complex(f, schema, field, member, i);

            } else {

                write_basic(f, schema, field, member, i);
            }
        }

        write("");
        write("   // Object.preventExtensions(self);");
        write("}");


// -------------------------------------------------------------------------
// - inheritance chain
// -------------------------------------------------------------------------


        write("util.inherits(" + classname + "," + baseclass + ");");
        if (has_enumeration) {
            write("");
            write("//define enumeration properties");
            write("Object.defineProperties(" + classname + ".prototype,_enum_properties);");
        }

// -------------------------------------------------------------------------
// - encodingDefaultBinary
// -------------------------------------------------------------------------

        if (RUNTIME_GENERATED_ID === encodingBinaryNodeId) {

            write("schema.id = generate_new_id();");
            write(classname + ".prototype.encodingDefaultBinary = makeExpandedNodeId(schema.id);");
        } else {
            write(classname + ".prototype.encodingDefaultBinary = makeExpandedNodeId(" + encodingBinaryNodeId.value + ",", encodingBinaryNodeId.namespace, ");");
        }


        if (encodingXmlNodeId) {
            write(classname + ".prototype.encodingDefaultXml = makeExpandedNodeId(" + encodingXmlNodeId.value + ",", encodingXmlNodeId.namespace, ");");
        }
        write(classname + ".prototype._schema = schema;");

//  --------------------------------------------------------------
//   expose encoder and decoder func for basic type that we need
//  --------------------------------------------------------------
        write("");
        n = schema.fields.length;
        var done = {};
        for (i = 0; i < n; i++) {
            field = schema.fields[i];
            fieldType = field.fieldType;
            if (!(fieldType in done)) {
                done[fieldType] = field;
                if (field.category === "enumeration") {
                    write("var encode_" + field.fieldType + " = _enumerations." + field.fieldType + ".encode;");
                    write("var decode_" + field.fieldType + " = _enumerations." + field.fieldType + ".decode;");
                } else if (field.category === "complex") {
                    //
                } else {
                    write("var encode_" + field.fieldType + " = _defaultTypeMap." + field.fieldType + ".encode;");
                    write("var decode_" + field.fieldType + " = _defaultTypeMap." + field.fieldType + ".decode;");
                }

            }
        }

//  --------------------------------------------------------------
//   implement encode
//  ---------------------------------------------------------------
        if (_.isFunction(schema.encode)) {

            write(classname + ".prototype.encode = function(stream,options) {");
            write("   schema.encode(this,stream,options); ");
            write("};");

        } else {

            write("/**");
            write(" * encode the object into a binary stream");
            write(" * @method encode");
            write(" *");
            write(" * @param stream {BinaryStream} ");
            write(" */");

            write(classname + ".prototype.encode = function(stream,options) {");
            write("    // call base class implementation first");
            write("    " + baseclass + ".prototype.encode.call(this,stream,options);");

            n = schema.fields.length;
            for (i = 0; i < n; i++) {
                field = schema.fields[i];
                fieldType = field.fieldType;
                member = field.name;

                if (field.category === "enumeration" || field.category === "basic") {

                    if (field.isArray) {
                        write("    encodeArray(this." + member + ", stream, encode_" + field.fieldType + ");");
                    } else {
                        write("    encode_" + field.fieldType + "(this." + member + ",stream);");
                    }

                } else if (field.category === "complex") {

                    if (field.isArray) {
                        write("    encodeArray(this." + member + ",stream,function(obj,stream){ obj.encode(stream,options); }); ");
                    } else {
                        write("   this." + member + ".encode(stream,options);");
                    }
                }
            }
            write("};");

        }

//  --------------------------------------------------------------
//   implement decode
//  ---------------------------------------------------------------
        if (_.isFunction(schema.decode)) {

            write("/**");
            write(" * decode the object from a binary stream");
            write(" * @method decode");
            write(" *");
            write(" * @param stream {BinaryStream} ");
            write(" * @param [option] {object} ");
            write(" */");

            write(classname + ".prototype.decode = function(stream,options) {");
            write("   schema.decode(this,stream,options); ");
            write("};");

            if (!_.isFunction(schema.decode_debug)) {
                throw new Error("schema decode requires also to provide a decode_debug " + schema.name);
            }
            write(classname + ".prototype.decode_debug = function(stream,options) {");
            write("   schema.decode_debug(this,stream,options); ");
            write("};");

        } else {

            write(classname + ".prototype.decode = function(stream,options) {");
            write("    // call base class implementation first");
            write("    " + baseclass + ".prototype.decode.call(this,stream,options);");

            n = schema.fields.length;
            for (i = 0; i < n; i++) {
                field = schema.fields[i];
                fieldType = field.fieldType;
                member = field.name;
                if (field.category === "enumeration" || field.category === "basic") {

                    if (field.isArray) {
                        write("    this." + member + " = decodeArray(stream, decode_" + field.fieldType + ");");
                    } else {

                        if (is_complex_type) {
                            write("    this." + member + ".decode(stream,options);");
                        } else {
                            if (_.isFunction(field.decode)) {
                                write("    this." + member + " = schema.fields[" + i + "].decode(stream,options);");
                            } else {
                                write("    this." + member + " = decode_" + field.fieldType + "(stream,options);");
                            }
                        }
                    }
                } else {

                    assert(field.category === "complex");
                    if (field.isArray) {
                        write("    this." + member + " = decodeArray(stream, function(stream) { ");
                        write("       var obj = new " + field.fieldType + "();");
                        write("       obj.decode(stream,options);");
                        write("       return obj; ");
                        write("    });");
                    } else {
                        write("    this." + member + ".decode(stream,options);");
                        // xx write("    this." + member + ".decode(stream,options);");
                    }

                }
            }
            write("};");

        }

//  --------------------------------------------------------------
//   implement explore
//  ---------------------------------------------------------------
//    write("/**");
//    write(" *");
//    write(" * pretty print the object");
//    write(" * @method explore");
//    write(" *");
//    write(" */");
//    write(classname + ".prototype.explore = function() {");
//    write("};");

        // ---------------------------------------
        if (_.isFunction(schema.isValid)) {
            write("/**");
            write(" *");
            write(" * verify that all object attributes values are valid according to schema");
            write(" * @method isValid");
            write(" * @return {Boolean}");
            write(" */");
            write(classname + ".prototype.isValid = function() { return schema.isValid(this); };");
        }


        function quotify(str) {
            return "\"" + str + "\"";
        }

        var possible_fields = extract_all_fields(schema);

        write(classname + ".possibleFields = (function() {");
        write("    return [");
        write("        " + possible_fields.map(quotify).join(",\n         "));
        write("    ];");
        write("})();");
        write("\n");


        write("exports." + classname + " = " + classname + ";");
        write("var register_class_definition = require(\"lib/misc/factories_factories\").register_class_definition;");
        write("register_class_definition(\"" + classname + "\"," + classname + ");");
        write("");


        f.save(source_file);

    }

    exports.produce_code = produce_code;
})(module, exports);
