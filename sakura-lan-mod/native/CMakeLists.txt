cmake_minimum_required(VERSION 3.22)
project(sakuralan_native LANGUAGES CXX)

option(SAKURALAN_RUNTIME_PROBE "Build the Unity/IL2CPP runtime player bridge" ON)

set(SAKURALAN_SOURCES
  LanRuntime.cpp
  ../src/UdpTransport.cpp
  ../src/LanSession.cpp
)

if(SAKURALAN_RUNTIME_PROBE)
  list(APPEND SAKURALAN_SOURCES SafeRuntimeBridge.cpp)
endif()

add_library(sakuralan SHARED ${SAKURALAN_SOURCES})

target_compile_features(sakuralan PRIVATE cxx_std_17)
target_compile_options(sakuralan PRIVATE -fvisibility=hidden)
target_include_directories(sakuralan PRIVATE ../src)
target_link_libraries(sakuralan PRIVATE log dl)
