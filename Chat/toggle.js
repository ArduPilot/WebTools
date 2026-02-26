// Toggle Script (Theme and API key visibility)

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  // Use distinct IDs for desktop and mobile theme buttons/icons
  const themeToggleButtonDesktop = document.getElementById('themeToggleButtonDesktop');
  const themeIconDesktop = document.getElementById('themeIconDesktop');
  const themeToggleButtonMobile = document.getElementById('themeToggleButtonMobile');
  const themeIconMobile = document.getElementById('themeIconMobile');


  // Function to set the theme
  function setTheme(theme) {
    if (theme === 'dark') {
      body.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');

      // Update desktop theme button
      if (themeIconDesktop) {
        themeIconDesktop.innerHTML = `
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            `;
        themeToggleButtonDesktop.classList.remove('bg-gray-200', 'text-gray-800', 'focus:ring-blue-500');
        themeToggleButtonDesktop.classList.add('bg-gray-700', 'text-gray-100', 'focus:ring-gray-400');
      }

      // Update mobile theme button
      if (themeIconMobile) {
        themeIconMobile.innerHTML = `
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            `;
        themeToggleButtonMobile.classList.remove('bg-gray-200', 'text-gray-800', 'focus:ring-blue-500');
        themeToggleButtonMobile.classList.add('bg-gray-700', 'text-gray-100', 'focus:ring-gray-400');
      }

    } else {
      body.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');

      // Update desktop theme button
      if (themeIconDesktop) {
        themeIconDesktop.innerHTML = `
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            `;
        themeToggleButtonDesktop.classList.remove('bg-gray-700', 'text-gray-100', 'focus:ring-gray-400');
        themeToggleButtonDesktop.classList.add('bg-gray-200', 'text-gray-800', 'focus:ring-blue-500');
      }

      // Update mobile theme button
      if (themeIconMobile) {
        themeIconMobile.innerHTML = `
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            `;
        themeToggleButtonMobile.classList.remove('bg-gray-700', 'text-gray-100', 'focus:ring-gray-400');
        themeToggleButtonMobile.classList.add('bg-gray-200', 'text-gray-800', 'focus:ring-blue-500');
      }
    }
  }

  // Check for saved theme preference on load
  const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light if no preference
  setTheme(savedTheme);

  // Add event listeners to both buttons if they exist
  if (themeToggleButtonDesktop) {
    themeToggleButtonDesktop.addEventListener('click', () => {
      const currentTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';
      setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
  }

  if (themeToggleButtonMobile) {
    themeToggleButtonMobile.addEventListener('click', () => {
      const currentTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';
      setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
  }


  // show/hide the OpenAI API key field
  function toggle_openai_api_key_visibility() {
    let openai_key_input = document.getElementById("openai_api_key");
    const eyeIconContainer = document.getElementById("eyeIcon"); // Get reference to the SVG element
    // Eye Icon (Open)
    const eyeOpenSVGPath = `
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clip-rule="evenodd" />
            `;

    // Eye-Slash Icon (Closed)
    const eyeClosedSVGPath = `
                <path fill-rule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clip-rule="evenodd" />
                <path d="m10.748 13.93 2.523 2.523a9.987 9.987 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
            `;

    if (openai_key_input.type === "password") {
      openai_key_input.type = "text";
      // Change icon to 'eye open'
      eyeIconContainer.innerHTML = eyeOpenSVGPath;
    } else {
      openai_key_input.type = "password";
      // Change icon to 'eye slash'
      eyeIconContainer.innerHTML = eyeClosedSVGPath;
    }
  }

  // listener for toggle api key visibility button click
  document.getElementById("toggleApiKeyButton").addEventListener("click", toggle_openai_api_key_visibility);

});
