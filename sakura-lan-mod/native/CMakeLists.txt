cmake_minimum_required(VERSION 3.22)
project(sakuralan_native LANGUAGES C CXX ASM)

include(FetchContent)
set(DOBBY_BUILD_EXAMPLE OFF CACHE BOOL "" FORCE)
set(DOBBY_BUILD_TEST OFF CACHE BOOL "" FORCE)
set(DOBBY_DEBUG OFF CACHE BOOL "" FORCE)
set(Plugin.SymbolResolver OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  dobby_src
  GIT_REPOSITORY https://github.com/jmpews/Dobby.git
  GIT_TAG 5dfc8546954ce3b3198132ab13fddb89ee92cdd7
  GIT_SHALLOW FALSE
)
FetchContent_MakeAvailable(dobby_src)

add_library(sakuralan SHARED
  RuntimeProbe.cpp
  LanRuntime.cpp
  ../src/UdpTransport.cpp
  ../src/LanSession.cpp
)

target_compile_features(sakuralan PRIVATE cxx_std_17)
target_compile_options(sakuralan PRIVATE -fvisibility=hidden)
target_include_directories(sakuralan PRIVATE ../src)
target_link_libraries(sakuralan PRIVATE log dl dobby_static)
