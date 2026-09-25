cmake_minimum_required(VERSION 3.16)
project(sakura_lan_mod LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(sakura_lan_core STATIC
  src/UdpTransport.cpp
  src/LanSession.cpp
  src/ModController.cpp
)
target_include_directories(sakura_lan_core PUBLIC src)

if(ANDROID)
  target_link_libraries(sakura_lan_core log android)
endif()

if(NOT ANDROID)
  add_executable(lan_integration_test tests/lan_integration_test.cpp)
  target_link_libraries(lan_integration_test PRIVATE sakura_lan_core pthread)
  enable_testing()
  add_test(NAME lan_integration COMMAND lan_integration_test)
  add_executable(lan_redirect_test tests/lan_redirect_test.cpp)
  target_link_libraries(lan_redirect_test PRIVATE sakura_lan_core pthread)
  add_test(NAME lan_redirect COMMAND lan_redirect_test)
  add_executable(near_code_page_test tests/near_code_page_test.cpp)
  add_test(NAME near_code_page COMMAND near_code_page_test)
  find_package(Python3 COMPONENTS Interpreter REQUIRED)
  add_test(NAME arm_relay_elf COMMAND ${Python3_EXECUTABLE}
    ${CMAKE_CURRENT_SOURCE_DIR}/tests/test_reserve_arm_relay.py)
endif()
