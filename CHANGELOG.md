# Changelog
**All dates are in YYYY/MM/DD (Year-Month-Day)**

## [1.0.2] - 2025-06-16

### Fixed
- **Windows Application Search**: Fixed critical issue where no applications were found on Windows systems
  - Improved process filtering logic to be less restrictive on Windows
  - Added better detection for user applications vs system processes
  - Enhanced application name handling for Windows executables (removes .exe extension for display)
  - Added comprehensive Windows application detection patterns
- **Cross-Platform Compatibility**: Enhanced application matching logic
  - Improved name matching to handle both display names and original process names
  - Better handling of Windows executable extensions in lock monitoring
  - Added platform-specific debugging output for troubleshooting

### Technical
- **Enhanced Process Detection**: Refined `getRunningApps()` function for better Windows support
- **Improved Filtering**: Streamlined system process exclusion while preserving user applications
- **Better Logging**: Added diagnostic logging for Windows application detection issues

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
