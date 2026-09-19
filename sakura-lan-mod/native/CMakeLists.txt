cmake_minimum_required(VERSION 3.22)
project(sakuralan_native LANGUAGES CXX)

add_library(sakuralan SHARED
  RuntimeProbe.cpp
  LanRuntime.cpp
  ../src/UdpTransport.cpp
  ../src/LanSession.cpp
)

target_compile_features(sakuralan PRIVATE cxx_std_17)
target_compile_options(sakuralan PRIVATE -fvisibility=hidden)
target_include_directories(sakuralan PRIVATE ../src)
target_link_libraries(sakuralan PRIVATE log dl)
