using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    public int score = 0;
    public int lives = 3;

    public Text scoreText;
    public Text livesText;

    public GameObject titlePanel;
    public Button startButton;

    public GameObject gameOverPanel;
    public Text finalScoreText;
    public Button restartButton;

    private bool isGameOver = false;
    private bool isPlaying = false;

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
        }
    }

    private void Start()
    {
        Time.timeScale = 1f;

        if (restartButton != null)
        {
            restartButton.onClick.AddListener(RestartGame);
        }

        if (startButton != null)
        {
            startButton.onClick.AddListener(StartGame);
        }

        if (titlePanel != null)
        {
            titlePanel.SetActive(true);
            isPlaying = false;
        }
        else
        {
            isPlaying = true;
        }

        if (gameOverPanel != null)
        {
            gameOverPanel.SetActive(false);
        }

        UpdateUI();
    }

    private void Update()
    {
        if (!isPlaying && !isGameOver && (Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return)))
        {
            StartGame();
        }

        if (isGameOver && (Input.GetKeyDown(KeyCode.R) || Input.GetKeyDown(KeyCode.Space) || Input.GetKeyDown(KeyCode.Return)))
        {
            RestartGame();
        }
    }

    public void StartGame()
    {
        isPlaying = true;
        isGameOver = false;
        if (titlePanel != null)
        {
            titlePanel.SetActive(false);
        }
    }

    public void AddScore(int amount)
    {
        if (isGameOver || !isPlaying)
        {
            return;
        }

        score += amount;
        UpdateUI();
    }

    public void LoseLife(int amount)
    {
        if (isGameOver || !isPlaying)
        {
            return;
        }

        lives -= amount;
        if (lives < 0)
        {
            lives = 0;
        }

        UpdateUI();

        if (lives <= 0)
        {
            TriggerGameOver();
        }
    }

    private void UpdateUI()
    {
        if (scoreText != null)
        {
            scoreText.text = "Score: " + score;
        }

        if (livesText != null)
        {
            livesText.text = "Lives: " + lives;
        }
    }

    private void TriggerGameOver()
    {
        isGameOver = true;
        isPlaying = false;

        if (gameOverPanel != null)
        {
            gameOverPanel.SetActive(true);
        }

        if (finalScoreText != null)
        {
            finalScoreText.text = "Final Score: " + score;
        }
    }

    public void RestartGame()
    {
        Time.timeScale = 1f;
        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
    }

    public bool IsGameOver()
    {
        return isGameOver;
    }

    public bool IsPlaying()
    {
        return isPlaying && !isGameOver;
    }
}
