#pragma once
#include <stdint.h>
#include <stddef.h>

// a variant of offsetof() to work around C++ restrictions.
// this can only be used when the offset of a variable in a object
// is constant and known at compile time
#define AP_VAROFFSET(type, element) (((ptrdiff_t)(&((const type *)1)->element))-1)

// find the type of a variable given the class and element
#define AP_CLASSTYPE(clazz, element) ((uint8_t)(((const clazz *) 1)->element.vtype))

// declare a group var_info line
#define AP_GROUPINFO_FLAGS(name, idx, clazz, element, def, flags) { name, AP_VAROFFSET(clazz, element), {def_value : def}, flags, idx, AP_CLASSTYPE(clazz, element)}

// declare a group var_info line
#define AP_GROUPINFO(name, idx, clazz, element, def) AP_GROUPINFO_FLAGS(name, idx, clazz, element, def, 0)

#define AP_GROUPEND     { "", 0,       { group_info : nullptr }, 0, 0xFF, AP_PARAM_NONE }

#define AP_PARAMDEFV(_t, _suffix, _pt)

enum ap_var_type {
    AP_PARAM_NONE    = 0,
    AP_PARAM_INT8    = 1,
    AP_PARAM_INT16   = 2,
    AP_PARAM_INT32   = 3,
    AP_PARAM_FLOAT   = 4,
    AP_PARAM_VECTOR3F= 5,
    AP_PARAM_GROUP   = 6,
};

/// Base class for variables.
///
/// Provides naming and lookup services for variables.
///
class AP_Param
{
public:
    // the Info and GroupInfo structures are passed by the main
    // program in setup() to give information on how variables are
    // named and their location in memory
    struct GroupInfo {
        const char *name;
        ptrdiff_t offset; // offset within the object
        union {
            const struct GroupInfo *group_info;
            const struct GroupInfo **group_info_ptr; // when AP_PARAM_FLAG_INFO_POINTER is set in flags
            const float def_value;
            ptrdiff_t def_value_offset; // Default value offset from param object, when AP_PARAM_FLAG_DEFAULT_POINTER is set in flags
        };
        uint16_t flags;
        uint8_t idx;  // identifier within the group
        uint8_t type; // AP_PARAM_*
    };
    struct Info {
        const char *name;
        const void *ptr;    // pointer to the variable in memory
        union {
            const struct GroupInfo *group_info;
            const struct GroupInfo **group_info_ptr; // when AP_PARAM_FLAG_INFO_POINTER is set in flags
            const float def_value;
            ptrdiff_t def_value_offset; // Default value offset from param object, when AP_PARAM_FLAG_DEFAULT_POINTER is set in flags
        };
        uint16_t flags;
        uint16_t key; // k_param_*
        uint8_t type; // AP_PARAM_*
    };
    struct ConversionInfo {
        uint16_t old_key; // k_param_*
        uint32_t old_group_element; // index in old object
        enum ap_var_type type; // AP_PARAM_*
        const char *new_name;
    };

    // param default table element
    struct defaults_table_struct {
        const char *name;   // parameter name
        float value;        // parameter value
    };

    // convert old vehicle parameters to new object parameters with scaling - assumes we use the same scaling factor for all values in the table
    static void         convert_old_parameters_scaled(const ConversionInfo *conversion_table, uint8_t table_size, float scaler, uint8_t flags) {};

    // load default values for scalars in a group
    static void         setup_object_defaults(const void *object_pointer, const struct GroupInfo *group_info) {};

};

/// Template class for scalar variables.
///
/// Objects of this type have a value, and can be treated in many ways as though they
/// were the value.
///
/// @tparam T			The scalar type of the variable
/// @tparam PT			The AP_PARAM_* type
///
template<typename T, ap_var_type PT>
class AP_ParamT
{
public:
    static const ap_var_type        vtype = PT;

    /// Value getter
    ///
    const T &get(void) const {
        return _value;
    }

    /// Value setter
    ///
    void set(const T &v) {
        _value = v;
    }

    // set a parameter that is an ENABLE param
    void set_enable(const T &v);
    
    /// Sets if the parameter is unconfigured
    ///
    void set_default(const T &v);

    /// Sets parameter and default
    ///
    void set_and_default(const T &v);

    /// Value setter - set value, tell GCS
    ///
    void set_and_notify(const T &v);

    /// Combined set and save
    ///
    void set_and_save(const T &v);

    /// Combined set and save, but only does the save if the value if
    /// different from the current ram value, thus saving us a
    /// scan(). This should only be used where we have not set() the
    /// value separately, as otherwise the value in EEPROM won't be
    /// updated correctly.
    void set_and_save_ifchanged(const T &v) {
        set(v);
    }

    /// Conversion to T returns a reference to the value.
    ///
    /// This allows the class to be used in many situations where the value would be legal.
    ///
    operator const T &() const {
        return _value;
    }

    /// AP_ParamT types can implement AP_Param::cast_to_float
    ///
    float cast_to_float(void) const;

    // return true if the parameter is configured
    bool configured(void) const { return true; }

protected:
    T _value;
};

/// Convenience macro for defining instances of the AP_ParamT template.
///
// declare a scalar type
// _t is the base type
// _suffix is the suffix on the AP_* type name
// _pt is the enum ap_var_type type
#define AP_PARAMDEF(_t, _suffix, _pt)   typedef AP_ParamT<_t, _pt> AP_ ## _suffix;
AP_PARAMDEF(float, Float, AP_PARAM_FLOAT);    // defines AP_Float
AP_PARAMDEF(int8_t, Int8, AP_PARAM_INT8);     // defines AP_Int8
AP_PARAMDEF(int16_t, Int16, AP_PARAM_INT16);  // defines AP_Int16
AP_PARAMDEF(int32_t, Int32, AP_PARAM_INT32);  // defines AP_Int32

