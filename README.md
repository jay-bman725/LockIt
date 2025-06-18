<div align="center">
  <h1>🔐 LockIt</h1>
  <p><strong>Take Control of Your Privacy</strong></p>
  <p>A powerful desktop application that locks specific applications behind a password or PIN, helping you maintain focus, secure your system from prying eyes, and secure sensitive apps.</p>

  <p>
    <img src="https://img.shields.io/badge/🔐-LockIt-blue?style=for-the-badge" alt="LockIt Logo">
    <img src="https://img.shields.io/badge/version-1.1.0-green?style=for-the-badge" alt="Version">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge" alt="Platform">
  </p>

  <p>
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Electron-36.4.0-47848F?logo=electron" alt="Electron">
    <img src="https://img.shields.io/badge/Built%20with-❤️-red" alt="Built with Love">
  </p>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [💻 System Requirements](#-system-requirements)
- [📱 How It Works](#-how-it-works)
- [🔧 Configuration](#-configuration)
- [🛡️ Use Cases](#️-use-cases)
- [🔧 Development](#-development)
- [🔒 Security Features](#-security-features)
- [🚧 Limitations](#-limitations)
- [❓ FAQ](#-faq)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## ✨ Features

- 🔒 **Lock Any Application**: Select from running apps and protect them with a PIN
- 🔍 **Background Monitoring**: Quietly monitors for locked apps and intervenes when needed
- 🛡️ **Full-Screen Lock Overlay**: Prevents access until the correct PIN is entered
- ⚙️ **Customizable Settings**: Set your own PIN and unlock duration
- 💾 **Local Storage**: All data stored locally and securely on your device
- 🎯 **Multiple Use Cases**: Perfect for focus, parental controls, or security

## 🚀 Quick Start

### 📦 Installation Options

#### Option 1: From Source (Recommended for Development)
```bash
# Clone the repository
git clone https://github.com/jay-bman725/LockIt.git
cd LockIt

# Install dependencies
npm install

# Run the application
npm start
```

#### Option 2: Download Pre-built Releases
> 🔄 **Coming Soon**: Download ready-to-use installers from our [Releases page](https://github.com/jay-bman725/LockIt/releases)

## 💻 System Requirements

| Platform | Minimum Requirements | Status |
|----------|---------------------|---------|
| **Windows** | Windows 10 (64-bit), 4GB RAM, 100MB disk space | ❌ **NOT WORKING** |
| **macOS** | macOS 10.15 Catalina, 4GB RAM, 100MB disk space | ✅ **WORKING** |
| **Linux** | Ubuntu 18.04+ / CentOS 8+, 4GB RAM, 100MB disk space | ❓ **UNKNOWN** |

> ⚠️ **Important Platform Notes**: 
> - **Windows**: Functionality is currently **NOT WORKING** 
> - **Linux**: Functionality status is **UNKNOWN** and untested
> - **macOS**: Fully functional and tested

**Note**: LockIt requires administrative privileges for optimal functionality.

### 🎯 First Run Setup

1. **Welcome Screen**: Launch LockIt and complete the onboarding process
2. **Choose Applications**: Navigate to "Available Apps" tab to view running applications
3. **Lock Applications**: Click "🔒 Lock" on applications you want to protect
4. **Customize PIN**: Go to "Settings" tab to set your custom PIN (default: 1234)
5. **Start Protection**: Click "▶️ Start Monitoring" to begin background protection
6. **Test Lock**: Try opening a locked app to see the lock screen in action

> 💡 **Pro Tip**: Start with locking a non-essential app to test the functionality before locking critical applications.

## 📱 How It Works

1. **Select Apps to Lock**: Browse running applications and choose which ones to protect
2. **Background Monitoring**: LockIt monitors active windows in the background
3. **Lock Screen Activation**: When a locked app is detected, a full-screen overlay appears
4. **PIN Authentication**: Enter your PIN to unlock the app temporarily
5. **Temporary Access**: Apps stay unlocked for your configured duration

## 🔧 Configuration

### Settings Panel
- **Security PIN**: Set a custom PIN (minimum 3 characters)
- **Unlock Duration**: How long apps stay unlocked after entering PIN
  - 30 seconds to 1 hour options available

### Data Storage
- Settings stored locally using `electron-store`
- No data sent to external servers
- PIN stored securely on your device

## 🛡️ Use Cases

### 🎯 Focus & Productivity
Lock distracting apps like:
- Social media applications
- Games and entertainment
- Chat applications
- Video streaming apps

### 👀 Protect from prying eyes
Does your roommate look through your computer? Now you can block them with:
- A secure 5-digit PIN
- Lockdown screen
- Only 10 PIN code tries until system lockdown

### 🔒 Security
Add an extra layer to:
- Banking applications
- Password managers
- Work applications
- Sensitive documents

## 🔧 Development

### Available Scripts
- `npm start`: Launch the application
- `npm run dev`: Launch with debugging enabled

### Dependencies
- **electron**: Desktop app framework
- **active-win**: Window detection
- **ps-list**: Process monitoring
- **electron-store**: Local data storage

## 🔒 Security Features

### Lock Screen Protection
- Full-screen overlay prevents access
- Keyboard shortcut blocking
- Anti-escape mechanisms
- Context menu disabled
- Window focus management

### Data Security
- Local storage only
- No network communication
- Encrypted settings storage
- No telemetry or tracking

## 🚧 Limitations

- **Not Unbreakable**: Technical users can bypass protections
- **Process-Level**: Works at application level, not system level
- **Active Monitoring**: Requires LockIt to be running
- **Platform-Specific**: Some features may vary by OS

## ❓ FAQ

<details>
<summary><strong>Can LockIt be bypassed by tech-savvy users?</strong></summary>
<br>
Yes, LockIt is designed for productivity and roommate protection, not as a security solution against determined attackers. Users with system knowledge can potentially bypass the locks.
</details>

<details>
<summary><strong>Does LockIt work with all applications?</strong></summary>
<br>
LockIt works with most desktop applications but may have limitations with:

- System applications

- Full-screen games

- Applications with elevated privileges
</details>

<details>
<summary><strong>What happens if I forget my PIN?</strong></summary>
<br>
You can reset your PIN by activating LockIt, then entering your PIN wrong 10 in a row, then entering your master password in the security lockdown screen, then choose the option to make a new PIN.
</details>

<details>
<summary><strong>Does LockIt consume a lot of system resources?</strong></summary>
<br>
No, LockIt is designed to be lightweight:
- Memory usage: ~50-100MB
- CPU usage: <1% during monitoring
- No background network activity
</details>

<details>
<summary><strong>Can I schedule when apps are locked?</strong></summary>
<br>
Scheduled locking is planned for version 1.2.0 Currently, apps are locked immediately when monitoring starts.
</details>

## 🛠️ Troubleshooting

### Common Issues

#### LockIt won't start
```bash
# Check Node.js version (requires 16+)
node --version

# Reinstall dependencies
npm install --force

# Run with debug output
npm run dev
```

#### Lock screen doesn't appear
1. **Check permissions**: Ensure LockIt has accessibility permissions
2. **Restart monitoring**: Stop and restart the monitoring service
3. **Update app list**: Refresh the available applications list

#### Applications are still accessible
1. **Verify lock status**: Check that the app shows as "🔒 Locked" in the interface
2. **Check monitoring**: Ensure "▶️ Start Monitoring" is active
3. **Restart LockIt**: Sometimes a restart resolves detection issues

#### Performance issues
1. **Close unnecessary apps**: Reduce the number of monitored applications
2. **Check system resources**: Ensure sufficient RAM and CPU available
3. **Update dependencies**: Run `npm update` to get latest versions

### Getting Help

If you encounter issues not covered here:
1. Check [GitHub Issues](https://github.com/jay-bman725/LockIt/issues) for existing solutions
2. Create a new issue with detailed system information
3. Include error logs from the console (available in dev mode)

## 🤝 Contributing

We love contributions from the community! Whether you're fixing bugs, adding features, or improving documentation, your help is appreciated.

### 🚀 Quick Contribution Guide

1. **Fork & Clone**
   ```bash
   git clone https://github.com/jay-bman725/LockIt.git
   cd LockIt
   npm install
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Make Changes**
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

4. **Test Thoroughly**
   ```bash
   npm run dev  # Test your changes
   npm run lint # Check code style
   ```

5. **Submit Pull Request**
   - Use a clear, descriptive title
   - Explain what changes you made and why
   - Reference any related issues

### 🎯 Areas We Need Help

- **🐛 Bug Fixes**: Check our [issues page](https://github.com/jay-bman725/LockIt/issues)
- **📚 Documentation**: Help improve guides and API docs
- **🧪 Testing**: Add unit tests and integration tests
- **🎨 UI/UX**: Design improvements and accessibility enhancements
- **🌍 Localization**: Translate LockIt to other languages

### 📋 Development Guidelines

- **Code Style**: We use ESLint with standard configuration
- **Documentation**: Update README, Changelog, and code comments

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

LockIt is designed as a productivity tool and a utility to remove prying eyes. It should not be considered a security solution for protecting against determined attackers or technical users who understand how to bypass application-level restrictions.

## 🙋‍♂️ Support & Community

### 📞 Get Help
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/jay-bman725/LockIt/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/jay-bman725/LockIt/discussions)
- 📖 **Documentation**: [Wiki](https://github.com/jay-bman725/LockIt/wiki)

### 🌟 Stay Connected
- ⭐ **Star us on GitHub** if you find LockIt useful

---

<div align="center">
  <h3>🔐 LockIt - Taking Control of Your Digital Privacy</h3>
  <p><strong>Made with ❤️ for productivity, focus, and digital wellness</strong></p>
  
  <p>
    <a href="#-quick-start">Get Started</a> •
    <a href="#-features">Features</a> •
    <a href="#-contributing">Contribute</a> •
    <a href="https://github.com/jay-bman725/LockIt/releases">Download</a>
  </p>
  
  <p>
    <img src="https://img.shields.io/github/stars/jay-bman725/LockIt?style=social" alt="GitHub stars">
    <img src="https://img.shields.io/github/forks/jay-bman725/LockIt?style=social" alt="GitHub forks">
  </p>
  
  <p><em>If LockIt helps you stay focused, consider giving it a ⭐ on GitHub!</em></p>
</div>
