#pragma once

#define ARRAY_SIZE(x) (sizeof(x) / sizeof((x)[0]))

#define WARN_IF_UNUSED

#define CLASS_NO_COPY(c)

// used to pack structures
#define PACKED __attribute__((__packed__))

#define ASSERT_STORAGE_SIZE(structure, size)