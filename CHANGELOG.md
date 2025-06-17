# Changelog
**All dates are in YYYY/MM/DD (Year-Month-Day)**

## [1.0.5] - 2025-06-17

### Enhanced Security & Focus Management 🔒

#### Security Lockdown Startup Fix
- **Fixed security lockdown persistence**: Application now properly detects and maintains security lockdown state across restarts
- **Enhanced startup checks**: Added comprehensive security state validation during application initialization
- **Automatic lockdown screen display**: System correctly shows security lockdown interface when restarted while in lockdown mode
- **Improved state recovery**: Enhanced failsafe mechanisms to ensure lockdown state is preserved and displayed

#### Advanced Focus Detection & Prevention
- **Aggressive focus monitoring**: Implemented multi-layered focus detection system for both PIN and security lockdown windows
  - PIN window: Monitored every 1 second
  - Security lockdown: Monitored every 500ms (enhanced security)
- **Enhanced focus enforcement**: Added robust window focus management with multiple enforcement methods
  - `focus()`, `moveTop()`, `setAlwaysOnTop()`, `show()` combination
  - JavaScript-level focus commands in web contents
  - Comprehensive visibility and state validation
- **System shortcut blocking**: Comprehensive prevention of escape attempts
  - **macOS**: Cmd+Tab, Cmd+W, Cmd+Q, Cmd+H, Cmd+M, Cmd+`
  - **Cross-platform**: Alt+Tab, Alt+F4, Ctrl+Space (Spotlight)
  - **Mission Control**: F3, F4, F9, F10, F11 prevention
  - **Custom combinations**: Advanced escape attempt detection and blocking

#### Advanced Security Event Monitoring
- **Window state change detection**: Real-time monitoring of fullscreen, visibility, and focus states
- **Automatic state recovery**: Self-healing system for any bypass attempts or state corruption
- **Input event filtering**: Comprehensive blocking of system shortcuts and escape key combinations
- **Enhanced refocus mechanisms**: Immediate window refocusing after any escape attempts

#### Improved Time Display
- **Precise lockdown timestamps**: Security lockdown screen now displays exact date and time instead of relative time
  - **Before**: "2 minutes ago" or "Just now"
  - **After**: "Jun 17, 2025, 2:45:30 PM"
- **Better incident tracking**: Enhanced security audit trail with precise timestamp information
- **Professional formatting**: Standardized date/time format with seconds precision

#### Resource Management & Performance
- **Enhanced cleanup systems**: Proper cleanup of all monitoring intervals and event listeners
- **Memory leak prevention**: Comprehensive resource management during window lifecycle
- **Performance optimization**: Balanced monitoring intervals for security without performance impact
- **Cross-platform stability**: Improved compatibility across Windows, macOS, and Linux

#### Failsafe & Recovery Systems
- **Periodic system validation**: Global failsafe checks every 30 seconds
- **Multi-layer protection**: Primary, secondary, and tertiary detection systems
- **Emergency state recovery**: Automatic correction of any security state deviations
- **Comprehensive logging**: Enhanced security event tracking and performance monitoring

### Technical Improvements
- **Enhanced error handling**: Improved error detection and recovery mechanisms
- **Code organization**: Better separation of security functions and focus management
- **Documentation**: Comprehensive inline documentation for security systems
- **Testing resilience**: More robust handling of edge cases and system interactions

## [1.0.4] - 2025-06-17

### Fixed Update System
- **Fixed version comparison logic**: Corrected the `compareVersions` function that was incorrectly treating newer remote versions as "no update available"
- **Fixed changelog URL**: Updated from `changelog.md` to `CHANGELOG.md` to match actual filename
- **Enhanced update detection**: Now properly detects when remote version (1.0.3) is newer than current version (1.0.0)

### Improved Update Modal Design
- **Responsive sizing**: Modal now uses 70% viewport width and 90% viewport height for better space utilization
- **Enhanced markdown rendering**: Improved changelog formatting with proper parsing of version headers like `[1.0.3] - 2025-06-16`
- **Better typography**: Added styled version headers with gradient backgrounds and improved readability
- **Flexible layout**: Converted to flexbox layout ensuring content adapts to available space with proper scrolling

## [1.0.3] - 2025-06-16

## Attempted to fix an error while getting applications on Windows, didnt work

## [1.0.2] - 2025-06-16

## Attempted to fix an error while getting applications on Windows, didnt work

## [1.0.1] - 2025-06-16

## Attempted to fix an error while getting applications on Windows, didnt work

## [1.0.0] - 2025-06-16

### Added
- **Initial Release**: LockIt application for enhanced system security and privacy
- **Comprehensive Lock System**: Multiple lock modes for different security scenarios
  - Standard lock mode for general privacy protection
  - Security lockdown mode for enhanced protection
  - Customizable lock interfaces with modern UI design
- **Onboarding Experience**: Guided first-time user setup
  - Interactive welcome flow introducing key features
  - Step-by-step security configuration guidance
  - User preference setup during initial launch
- **Multi-Window Architecture**: Dedicated windows for different security states
  - Main application window for primary controls
  - Lock overlay window for active protection
  - Onboarding window for initial setup
  - Security lockdown window for enhanced protection
- **Modern User Interface**: Clean and intuitive design
  - Responsive layout with CSS Grid and Flexbox
  - Custom styling with CSS variables for consistent theming
  - Professional gradients and animations
  - Cross-platform compatibility (Windows, macOS, Linux)
- **Electron-Based Architecture**: Built with modern web technologies
  - Secure inter-process communication (IPC)
  - Native desktop integration
  - Hardware-accelerated rendering
  - System tray integration capabilities

### Features
- **Security Protection**: Core lock functionality to protect user privacy
- **Multiple Lock Modes**: Different security levels for various use cases
- **User-Friendly Interface**: Intuitive controls and clear visual feedback
- **Cross-Platform Support**: Works on Windows, macOS, and Linux
- **Lightweight Performance**: Minimal system resource usage
- **Instant Activation**: Quick lock engagement for immediate protection

### Technical
- **Electron Framework**: Built on Electron for cross-platform desktop application
- **Modern JavaScript**: ES6+ features with proper module organization
- **CSS3 Styling**: Advanced styling with custom properties and animations
- **HTML5 Structure**: Semantic markup for accessibility and maintainability
- **IPC Communication**: Secure communication between main and renderer processes
- **File Organization**: Clean project structure with separated concerns
  - Main process handling in `src/main/`
  - Renderer processes in `src/renderer/`
  - Static assets in `src/assets/`

### User Experience
- **Onboarding Flow**: Smooth introduction to application features
- **Intuitive Controls**: Easy-to-understand interface elements
- **Visual Feedback**: Clear status indicators and transitions
- **Accessibility**: Keyboard navigation and screen reader support
- **Performance**: Fast startup and responsive interactions

---

# Notes

### Version Naming Convention
- **Major version** (x.0.0): Significant new features or breaking changes
- **Minor version** (x.y.0): New features and enhancements
- **Patch version** (x.y.z): Bug fixes and small improvements

### Upcoming Features
- Additional lock modes and customization options
- Advanced security configurations
- System integration enhancements
- User preference persistence
- Performance optimizations
- Additional platform-specific features

All notable changes to LockIt will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
