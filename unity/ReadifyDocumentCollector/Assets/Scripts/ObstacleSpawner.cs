using UnityEngine;

public class ObstacleSpawner : MonoBehaviour
{
    public GameObject obstaclePrefab;
    public float spawnInterval = 2f;
    public float xRange = 7.5f;
    public float spawnY = 5.5f;

    private float timer = 1f;

    private void Update()
    {
        if (GameManager.Instance != null && !GameManager.Instance.IsPlaying())
        {
            return;
        }

        timer -= Time.deltaTime;
        if (timer <= 0f)
        {
            SpawnObstacle();
            timer = spawnInterval;
        }
    }

    private void SpawnObstacle()
    {
        if (obstaclePrefab == null)
        {
            return;
        }

        float randomX = Random.Range(-xRange, xRange);
        Vector3 spawnPosition = new Vector3(randomX, spawnY, 0f);
        Instantiate(obstaclePrefab, spawnPosition, Quaternion.identity);
    }
}
