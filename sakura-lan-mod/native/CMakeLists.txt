cmake_minimum_required(VERSION 3.22)
project(sakuralan_native LANGUAGES CXX)

option(SAKURALAN_RUNTIME_PROBE "Build the Unity/IL2CPP runtime player bridge" ON)

set(SAKURALAN_SOURCES
  LanRuntime.cpp
  ../src/UdpTransport.cpp
  ../src/LanSession.cpp
)

if(SAKURALAN_RUNTIME_PROBE)
  include(FetchContent)
  set(DOBBY_DEBUG OFF CACHE BOOL "" FORCE)
  set(DOBBY_BUILD_EXAMPLE OFF CACHE BOOL "" FORCE)
  set(DOBBY_BUILD_TEST OFF CACHE BOOL "" FORCE)
  set(Plugin.SymbolResolver OFF CACHE BOOL "" FORCE)
  set(Plugin.ImportTableReplace OFF CACHE BOOL "" FORCE)
  set(Plugin.Android.BionicLinkerUtil OFF CACHE BOOL "" FORCE)

  FetchContent_Declare(
    dobby_src
    URL https://github.com/jmpews/Dobby/archive/refs/heads/master.zip
  )
  FetchContent_MakeAvailable(dobby_src)

  list(APPEND SAKURALAN_SOURCES SafeRuntimeBridge.cpp)
endif()

add_library(sakuralan SHARED ${SAKURALAN_SOURCES})

target_compile_features(sakuralan PRIVATE cxx_std_17)
target_compile_options(sakuralan PRIVATE -fvisibility=hidden)
target_include_directories(sakuralan PRIVATE ../src)
target_link_libraries(sakuralan PRIVATE log dl)

if(SAKURALAN_RUNTIME_PROBE)
  target_link_libraries(sakuralan PRIVATE dobby_static)
endif()
