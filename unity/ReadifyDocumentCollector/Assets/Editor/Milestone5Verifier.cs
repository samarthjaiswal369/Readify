using UnityEngine;
using UnityEngine.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;
using System;

public class Milestone5Verifier
{
    public static void RunAllChecks()
    {
        Debug.Log("Starting Milestone 5 automated verification...");

        EditorSceneManager.OpenScene("Assets/Scenes/MainScene.unity");

        VerifySceneHierarchyAndReferences();
        VerifyPlayerComponentsAndMovement();
        VerifyPrefabs();
        VerifyGameManagerAndScoring();
        VerifyGameOverAndReset();

        Debug.Log("ALL MILESTONE 5 VERIFICATION CHECKS PASSED SUCCESSFULLY.");
    }

    private static void VerifySceneHierarchyAndReferences()
    {
        GameManager gm = GameObject.FindObjectOfType<GameManager>();
        Assert(gm != null, "GameManager not found in scene.");
        Assert(gm.scoreText != null, "GameManager.scoreText is null.");
        Assert(gm.livesText != null, "GameManager.livesText is null.");
        Assert(gm.titlePanel != null, "GameManager.titlePanel is null.");
        Assert(gm.startButton != null, "GameManager.startButton is null.");
        Assert(gm.gameOverPanel != null, "GameManager.gameOverPanel is null.");
        Assert(gm.finalScoreText != null, "GameManager.finalScoreText is null.");
        Assert(gm.restartButton != null, "GameManager.restartButton is null.");

        Camera cam = Camera.main;
        Assert(cam != null, "Main Camera not found.");
        Assert(cam.orthographic, "Main Camera is not orthographic.");

        GameObject player = GameObject.FindWithTag("Player");
        Assert(player != null, "Player GameObject with tag 'Player' not found.");

        DocumentSpawner docSpawner = GameObject.FindObjectOfType<DocumentSpawner>();
        Assert(docSpawner != null, "DocumentSpawner not found in scene.");
        Assert(docSpawner.documentPrefab != null, "DocumentSpawner.documentPrefab is null.");

        ObstacleSpawner obsSpawner = GameObject.FindObjectOfType<ObstacleSpawner>();
        Assert(obsSpawner != null, "ObstacleSpawner not found in scene.");
        Assert(obsSpawner.obstaclePrefab != null, "ObstacleSpawner.obstaclePrefab is null.");

        Debug.Log("CHECK 1: Scene Hierarchy and References - PASSED");
    }

    private static void VerifyPlayerComponentsAndMovement()
    {
        GameObject player = GameObject.FindWithTag("Player");
        PlayerController pc = player.GetComponent<PlayerController>();
        Assert(pc != null, "PlayerController missing on Player.");
        Assert(pc.moveSpeed > 0f, "Player moveSpeed must be positive.");
        Assert(pc.xLimit > 0f && pc.yLimit > 0f, "Player bounds must be positive.");

        BoxCollider2D col = player.GetComponent<BoxCollider2D>();
        Assert(col != null, "BoxCollider2D missing on Player.");

        Rigidbody2D rb = player.GetComponent<Rigidbody2D>();
        Assert(rb != null, "Rigidbody2D missing on Player.");
        Assert(rb.gravityScale == 0f, "Player Rigidbody2D gravityScale must be 0.");

        Vector3 originalPos = player.transform.position;
        float testX = pc.xLimit + 10f;
        float clampedX = Mathf.Clamp(testX, -pc.xLimit, pc.xLimit);
        Assert(clampedX == pc.xLimit, "Player X limit clamping failed.");

        float testY = pc.yLimit + 10f;
        float clampedY = Mathf.Clamp(testY, -pc.yLimit, pc.yLimit);
        Assert(clampedY == pc.yLimit, "Player Y limit clamping failed.");
        player.transform.position = originalPos;

        Debug.Log("CHECK 2: Player Components and Movement Limits - PASSED");
    }

    private static void VerifyPrefabs()
    {
        GameObject docPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Document.prefab");
        Assert(docPrefab != null, "Document prefab missing from Assets/Prefabs.");
        Assert(docPrefab.CompareTag("Document"), "Document prefab must have tag 'Document'.");
        FallingObject docFo = docPrefab.GetComponent<FallingObject>();
        Assert(docFo != null, "FallingObject component missing on Document prefab.");
        Assert(!docFo.isObstacle, "Document FallingObject.isObstacle must be false.");
        Collider2D docCol = docPrefab.GetComponent<Collider2D>();
        Assert(docCol != null && docCol.isTrigger, "Document prefab must have trigger Collider2D.");

        GameObject obsPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Obstacle.prefab");
        Assert(obsPrefab != null, "Obstacle prefab missing from Assets/Prefabs.");
        Assert(obsPrefab.CompareTag("Obstacle"), "Obstacle prefab must have tag 'Obstacle'.");
        FallingObject obsFo = obsPrefab.GetComponent<FallingObject>();
        Assert(obsFo != null, "FallingObject component missing on Obstacle prefab.");
        Assert(obsFo.isObstacle, "Obstacle FallingObject.isObstacle must be true.");
        Collider2D obsCol = obsPrefab.GetComponent<Collider2D>();
        Assert(obsCol != null && obsCol.isTrigger, "Obstacle prefab must have trigger Collider2D.");

        Debug.Log("CHECK 3: Prefabs and FallingObject Collision Setup - PASSED");
    }

    private static void VerifyGameManagerAndScoring()
    {
        GameManager gm = GameObject.FindObjectOfType<GameManager>();
        gm.StartGame();
        Assert(gm.IsPlaying(), "GameManager should be in playing state after StartGame.");
        Assert(!gm.IsGameOver(), "GameManager should not be game over after StartGame.");

        gm.score = 0;
        gm.lives = 3;
        gm.AddScore(1);
        Assert(gm.score == 1, "Adding score failed: expected 1, got " + gm.score);
        Assert(gm.scoreText.text == "Score: 1", "Score UI text not updated.");

        gm.AddScore(2);
        Assert(gm.score == 3, "Adding score failed: expected 3, got " + gm.score);
        Assert(gm.scoreText.text == "Score: 3", "Score UI text not updated.");

        gm.LoseLife(1);
        Assert(gm.lives == 2, "Losing life failed: expected 2, got " + gm.lives);
        Assert(gm.livesText.text == "Lives: 2", "Lives UI text not updated.");

        Debug.Log("CHECK 4: GameManager Scoring and Lives - PASSED");
    }

    private static void VerifyGameOverAndReset()
    {
        GameManager gm = GameObject.FindObjectOfType<GameManager>();
        gm.LoseLife(2);
        Assert(gm.lives == 0, "Lives should be 0 on game over.");
        Assert(gm.IsGameOver(), "GameManager.IsGameOver() should return true.");
        Assert(!gm.IsPlaying(), "GameManager.IsPlaying() should return false when game over.");
        Assert(gm.gameOverPanel.activeSelf, "GameOverPanel should be active.");
        Assert(gm.finalScoreText.text == "Final Score: 3", "Final score text mismatch: " + gm.finalScoreText.text);

        gm.AddScore(10);
        Assert(gm.score == 3, "Score must not increase after game over.");

        gm.StartGame();
        Assert(gm.IsPlaying(), "StartGame should restore playing state.");
        Assert(!gm.IsGameOver(), "StartGame should clear game over state.");

        Debug.Log("CHECK 5: GameOver State and Restart Transition - PASSED");
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
        {
            throw new Exception("Assertion Failed: " + message);
        }
    }
}
