import './App.css'

import { ClockIcon } from '@heroicons/react/outline'
import { format } from 'date-fns'
import { default as GraphemeSplitter } from 'grapheme-splitter'
import { useEffect, useState } from 'react'
import Div100vh from 'react-div-100vh'
import { useSDK } from '@metamask/sdk-react-ui';

import { AlertContainer } from './components/alerts/AlertContainer'
import { Grid } from './components/grid/Grid'
import { Keyboard } from './components/keyboard/Keyboard'
import { DatePickerModal } from './components/modals/DatePickerModal'
import { InfoModal } from './components/modals/InfoModal'
import { MigrateStatsModal } from './components/modals/MigrateStatsModal'
import { SettingsModal } from './components/modals/SettingsModal'
import { StatsModal } from './components/modals/StatsModal'
import { Navbar } from './components/navbar/Navbar'
import {
  DATE_LOCALE,
  DISCOURAGE_INAPP_BROWSERS,
  LONG_ALERT_TIME_MS,
  MAX_CHALLENGES,
  REVEAL_TIME_MS,
  WELCOME_INFO_MODAL_MS,
} from './constants/settings'
import {
  CORRECT_WORD_MESSAGE,
  DISCOURAGE_INAPP_BROWSER_TEXT,
  GAME_COPIED_MESSAGE,
  HARD_MODE_ALERT_MESSAGE,
  NOT_ENOUGH_LETTERS_MESSAGE,
  SHARE_FAILURE_TEXT,
  WIN_MESSAGES,
  WORD_NOT_FOUND_MESSAGE,
} from './constants/strings'
import { useAlert } from './context/AlertContext'
import { isInAppBrowser } from './lib/browser'
import {
  getStoredIsHighContrastMode,
  loadGameStateFromLocalStorage,
  saveGameStateToLocalStorage,
  setStoredIsHighContrastMode,
} from './lib/localStorage'
import { addStatsForCompletedGame, loadStats } from './lib/stats'
import {
  findFirstUnusedReveal,
  getGameDate,
  getIsLatestGame,
  isWinningWord,
  isWordInWordList,
  setGameDate,
  solution,
  solutionGameDate,
  unicodeLength,
} from './lib/words'

import {
  initFHE,
  getIsGameFinished,
  getIsGameStarted,
  guessWord,
  getGuesses
} from './lib/blockchain'
import { getGuessStatuses } from './lib/statuses'

function App() {
  const isLatestGame = getIsLatestGame()
  const gameDate = getGameDate()
  const prefersDarkMode = window.matchMedia(
    '(prefers-color-scheme: dark)'
  ).matches

  const { showError: showErrorAlert, showSuccess: showSuccessAlert } =
    useAlert()
  const [isFhevmInitialized, setFhevmInitialized] = useState(false);
  const [currentGuess, setCurrentGuess] = useState('')
  const [isGameWon, setIsGameWon] = useState(false)
  const [isGameStarted, setIsGameStarted] = useState(false)
  const [isGameFinished, setIsGameFinished] = useState(false)
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false)
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = useState(false)
  const [isMigrateStatsModalOpen, setIsMigrateStatsModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [currentRowClass, setCurrentRowClass] = useState('')
  const [isGameLost, setIsGameLost] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem('theme')
      ? localStorage.getItem('theme') === 'dark'
      : prefersDarkMode
      ? true
      : false
  )
  const [isHighContrastMode, setIsHighContrastMode] = useState(
    getStoredIsHighContrastMode()
  )
  const [isRevealing, setIsRevealing] = useState(false)
  const [guesses, setGuesses] = useState<[string,number,number][]>(() => {
    const arr: [string, number, number][] = [];
    return arr;
  });

  const [stats, setStats] = useState(() => loadStats())

  const [isHardMode, setIsHardMode] = useState(
    localStorage.getItem('gameMode')
      ? localStorage.getItem('gameMode') === 'hard'
      : false
  )

  const { sdk, connected, connecting, provider, chainId } = useSDK();

  useEffect(() => {
    const changeChain = async() => {
      try {
        await provider?.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x1F49' }],
        });
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await provider?.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0x1F49',
                  chainName: 'Zama Network',
                  rpcUrls: ['https://devnet.zama.ai'],
                  blockExplorerUrls: ['https://main.explorer.zama.ai'],
                  nativeCurrency: {
                    decimals: 18,
                    name: 'ZAMA',
                    symbol: 'ZAMA',
                  }
                },
              ],
            });
          } catch (addError) {
            // handle "add" error
          }
        }
        // handle other "switch" errors
      }
    }
    changeChain();
  })

  useEffect(() => {
    console.log("HERE");
    initFHE(provider!).then(() => {
      console.log("INITED");
      setFhevmInitialized(true);
    })
    .catch(() => setFhevmInitialized(false));
  }, [provider]);

  useEffect(() => {
    getIsGameFinished().then(res => {
      setIsGameFinished(res);
    })
  }, [isFhevmInitialized])

  useEffect(() => {
    console.log("IS GAME STARTED");
    getIsGameStarted().then(res => {
      console.log(res);
      setIsGameStarted(res);
    })
  }, [isFhevmInitialized])

  useEffect(() => {
    if (isFhevmInitialized) {
      getGuesses([])
      .then(curGuesses => {
        setGuesses(curGuesses);
        if (curGuesses.length > 0) {
          let statuses = getGuessStatuses(curGuesses.at(curGuesses.length-1)!);
          if (statuses.filter(val => val === "correct").length === 5) {
            setIsGameWon(true);
          }
        }
      })
    }
  }, [isFhevmInitialized]);


  useEffect(() => {
    // if no game state on load,
    // show the user the how-to info modal
    if (!loadGameStateFromLocalStorage(true)) {
      setTimeout(() => {
        setIsInfoModalOpen(true)
      }, WELCOME_INFO_MODAL_MS)
    }
  })

  useEffect(() => {
    DISCOURAGE_INAPP_BROWSERS &&
      isInAppBrowser() &&
      showErrorAlert(DISCOURAGE_INAPP_BROWSER_TEXT, {
        persist: false,
        durationMs: 7000,
      })
  }, [showErrorAlert])

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    if (isHighContrastMode) {
      document.documentElement.classList.add('high-contrast')
    } else {
      document.documentElement.classList.remove('high-contrast')
    }
  }, [isDarkMode, isHighContrastMode])

  const handleDarkMode = (isDark: boolean) => {
    setIsDarkMode(isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }

  const handleHighContrastMode = (isHighContrast: boolean) => {
    setIsHighContrastMode(isHighContrast)
    setStoredIsHighContrastMode(isHighContrast)
  }

  const clearCurrentRowClass = () => {
    setCurrentRowClass('')
  }

  useEffect(() => {
    if (isGameWon) {
      const winMessage =
        WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)]
      const delayMs = REVEAL_TIME_MS * solution.length

      showSuccessAlert(winMessage, {
        delayMs,
        onClose: () => setIsStatsModalOpen(true),
      })
    }

    if (isGameLost) {
      setTimeout(
        () => {
          setIsStatsModalOpen(true)
        },
        (solution.length + 1) * REVEAL_TIME_MS
      )
    }
  }, [isGameWon, isGameLost, showSuccessAlert])

  const onChar = (value: string) => {
    if (
      unicodeLength(`${currentGuess}${value}`) <= solution.length &&
      guesses.length < MAX_CHALLENGES &&
      !isGameWon
    ) {
      setCurrentGuess(`${currentGuess}${value}`)
    }
  }

  const onDelete = () => {
    setCurrentGuess(
      new GraphemeSplitter().splitGraphemes(currentGuess).slice(0, -1).join('')
    )
  }

  const onEnter = async () => {
    if (isGameWon || isGameLost) {
      return
    }

    if (!(unicodeLength(currentGuess) === solution.length)) {
      setCurrentRowClass('jiggle')
      return showErrorAlert(NOT_ENOUGH_LETTERS_MESSAGE, {
        onClose: clearCurrentRowClass,
      })
    }

    if (!isWordInWordList(currentGuess)) {
      setCurrentRowClass('jiggle')
      return showErrorAlert(WORD_NOT_FOUND_MESSAGE, {
        onClose: clearCurrentRowClass,
      })
    }

    // setIsRevealing(true)
    // // turn this back off after all
    // // chars have been revealed
    // setTimeout(() => {
    //   setIsRevealing(false)
    // }, REVEAL_TIME_MS * solution.length)

    await guessWord(currentGuess);
    const curGuesses = await getGuesses(guesses);
    console.log("kek ", curGuesses);
    setGuesses(curGuesses);
    setCurrentGuess('');
    let isFinished = await getIsGameFinished();
    setIsGameFinished(isFinished);
    let statuses = getGuessStatuses(curGuesses.at(curGuesses.length-1)!);
    if (statuses.filter(val => val === "correct").length === 5) {
      setIsGameWon(true);
    }
    
    // if (
    //   unicodeLength(currentGuess) === solution.length &&
    //   guesses.length < MAX_CHALLENGES &&
    //   !isGameWon
    // ) {
    //   setGuesses([...guesses, currentGuess])
    //   setCurrentGuess('')

    //   if (winningWord) {
    //     if (isLatestGame) {
    //       setStats(addStatsForCompletedGame(stats, guesses.length))
    //     }
    //     return setIsGameWon(true)
    //   }

    //   if (guesses.length === MAX_CHALLENGES - 1) {
    //     if (isLatestGame) {
    //       setStats(addStatsForCompletedGame(stats, guesses.length + 1))
    //     }
    //     setIsGameLost(true)
    //     showErrorAlert(CORRECT_WORD_MESSAGE(solution), {
    //       persist: true,
    //       delayMs: REVEAL_TIME_MS * solution.length + 1,
    //     })
    //   }
    // }
  }

  if (!isFhevmInitialized)
    return null;

  return (
    <Div100vh>
      <div className="flex h-full flex-col">
        <Navbar
          setIsInfoModalOpen={setIsInfoModalOpen}
          setIsGameStarted={setIsGameStarted}
          metamaskProvider={provider!}
          isGameStarted={isGameStarted}
          isGameWon={isGameWon}
          guesses={guesses}
        />

        {!isLatestGame && (
          <div className="flex items-center justify-center">
            <ClockIcon className="h-6 w-6 stroke-gray-600 dark:stroke-gray-300" />
            <p className="text-base text-gray-600 dark:text-gray-300">
              {format(gameDate, 'd MMMM yyyy', { locale: DATE_LOCALE })}
            </p>
          </div>
        )}

        <div className="mx-auto flex w-full grow flex-col px-1 pt-2 pb-8 sm:px-6 md:max-w-7xl lg:px-8 short:pb-2 short:pt-2">
          
          {
            isGameStarted &&
            (
              <div>
              <div className="flex grow flex-col justify-center pb-6 short:pb-2">
                <Grid
                  guesses={guesses}
                  currentGuess={currentGuess}
                  isRevealing={isRevealing}
                  currentRowClassName={currentRowClass}
                />
              </div>
              <Keyboard
                onChar={onChar}
                onDelete={onDelete}
                onEnter={onEnter}
                isRevealing={isRevealing}
              />
              </div>
            )
          }
          <p style={{
            textAlign: "center",
            marginTop: "30px",
          }}>If you are not seeing some updates, refresh the page! The state is fully saved on blockchain</p>
          <InfoModal
            isOpen={isInfoModalOpen}
            handleClose={() => setIsInfoModalOpen(false)}
          />
          <AlertContainer />
        </div>
      </div>
    </Div100vh>
  )
}

export default App